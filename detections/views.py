import os
import cv2
import numpy as np
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from ultralytics import YOLO
import base64
from django.shortcuts import render
import logging
import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url
import uuid
import tempfile

logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name="dwz2vp8za",
    api_key="964584595361623",
    api_secret="8MWLq1u0uODPxRUERF9QjdsLdEk",  #
    secure=True
)

model_path = os.path.join('.', 'runs', 'detect',
                          'train35', 'weights', 'best.pt')

try:
    model = YOLO(model_path)
    logger.info(f"Model loaded successfully from {model_path}")
except Exception as e:
    logger.error(f"Error loading model: {str(e)}")
    model = None


def index(request):
    return render(request, 'index.html')


@csrf_exempt
def detect_elements(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Only POST method is allowed'}, status=405)

    if 'image' not in request.FILES:
        return JsonResponse({'success': False, 'error': 'No image file provided'}, status=400)

    try:
        if model is None:
            return JsonResponse({'success': False, 'error': 'Model not loaded'}, status=500)

        image_file = request.FILES['image']

        # Save the uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            for chunk in image_file.chunks():
                temp_file.write(chunk)
            temp_file_path = temp_file.name

        try:
            # Create a unique ID for the image
            unique_id = str(uuid.uuid4())
            folder_name = "yolo_training_images"

            # Upload original image to Cloudinary
            upload_result = cloudinary.uploader.upload(
                temp_file_path,
                public_id=f"{unique_id}",
                folder=folder_name,
                tags=["yolo_training"]
            )

            cloudinary_url = upload_result['secure_url']

            # Read the image for detection
            image = cv2.imread(temp_file_path)

            if image is None:
                return JsonResponse({'success': False, 'error': 'Could not decode image'}, status=400)

            height, width = image.shape[:2]
            base_dimension = min(width, height)
            font_scale = max(0.3, base_dimension / 1000)
            thickness = max(1, int(base_dimension / 500))
            rect_thickness = max(1, int(base_dimension / 400))

            threshold = 0
            results = model(image)[0]

            detections = []
            for result in results.boxes.data.tolist():
                x1, y1, x2, y2, score, class_id = result

                if score > threshold:
                    cv2.rectangle(image, (int(x1), int(y1)),
                                  (int(x2), int(y2)), (0, 255, 0), rect_thickness)

                    class_name = results.names[int(class_id)].lower()
                    text_y_offset = max(15, int(20 * font_scale))

                    cv2.putText(image, f"{class_name} ({score:.2f})",
                                (int(x1), int(y1) -
                                 text_y_offset), cv2.FONT_HERSHEY_SIMPLEX,
                                font_scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
                    cv2.putText(image, f"{class_name} ({score:.2f})",
                                (int(x1), int(y1) -
                                 text_y_offset), cv2.FONT_HERSHEY_SIMPLEX,
                                font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

                    detections.append({
                        'class_id': int(class_id),
                        'class_name': class_name,
                        'coordinates': [int(x1), int(y1), int(x2-x1), int(y2-y1)],
                        'confidence': float(score)
                    })

            # For displaying in frontend
            _, buffer = cv2.imencode('.png', image)
            img_base64 = base64.b64encode(buffer).decode('utf-8')

            return JsonResponse({
                'success': True,
                'detections': detections,
                'image_base64': f'data:image/png;base64,{img_base64}',
                'image_width': width,
                'image_height': height,
                'cloudinary_url': cloudinary_url
            })

        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)

    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def get_training_images(request):
    try:
        # Get a list of images tagged for training
        result = cloudinary.Search().expression(
            'folder:yolo_training_images AND tags=yolo_training').execute()

        images = []
        for resource in result['resources']:
            images.append({
                'public_id': resource['public_id'],
                'url': resource['secure_url'],
                'created_at': resource['created_at']
            })

        return JsonResponse({
            'success': True,
            'images': images
        })

    except Exception as e:
        logger.error(f"Error fetching training images: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def download_training_data(request):
    try:
        # Get images for training
        search_result = cloudinary.Search().expression(
            'folder:yolo_training_images AND tags=yolo_training').execute()

        # Create a temporary directory for training data
        training_dir = os.path.join(
            tempfile.gettempdir(), 'yolo_training_data')
        os.makedirs(training_dir, exist_ok=True)

        # Download each image
        for resource in search_result['resources']:
            image_url = resource['secure_url']
            image_id = resource['public_id'].split('/')[-1]

            # Download image
            import requests
            response = requests.get(image_url)

            if response.status_code == 200:
                with open(os.path.join(training_dir, f"{image_id}.jpg"), 'wb') as f:
                    f.write(response.content)

        return JsonResponse({
            'success': True,
            'message': f"Downloaded {len(search_result['resources'])} images for training",
            'training_dir': training_dir
        })

    except Exception as e:
        logger.error(f"Error downloading training images: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
