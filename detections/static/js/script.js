document.addEventListener('DOMContentLoaded', function () {
    // File upload functionality
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const removeImageBtn = document.getElementById('remove-image');
    const detectBtn = document.getElementById('detect-btn');
    const resultsPlaceholder = document.getElementById('results-placeholder');
    const detectionResults = document.getElementById('detection-results');
    const detectionImageContainer = document.getElementById('detection-image-container');
    const detectionTable = document.getElementById('detection-tbody');

    // Drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('drag-over');
    }

    function unhighlight() {
        dropArea.classList.remove('drag-over');
    }

    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            handleFiles(files);
        }
    }

    // Handle file selection via input
    fileInput.addEventListener('change', function () {
        if (this.files.length > 0) {
            handleFiles(this.files);
        }
    });

    function handleFiles(files) {
        const file = files[0];

        // Validate file type
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert('Please upload a valid image file (PNG, JPG, JPEG, WebP)');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('File size exceeds 10MB limit');
            return;
        }

        // Display preview
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImage.src = e.target.result;
            previewContainer.hidden = false;
            document.querySelector('.upload-placeholder').style.display = 'none';
            detectBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    // Remove image preview
    removeImageBtn.addEventListener('click', function () {
        previewContainer.hidden = true;
        document.querySelector('.upload-placeholder').style.display = 'flex';
        previewImage.src = '#';
        fileInput.value = '';
        detectBtn.disabled = true;

        // Reset results
        resetResults();
    });

    function resetResults() {
        resultsPlaceholder.style.display = 'flex';
        detectionResults.hidden = true;
        detectionImageContainer.innerHTML = '';
        detectionTable.innerHTML = '';
    }

    // Detect elements button click
    detectBtn.addEventListener('click', function () {
        // Show loading state
        detectBtn.disabled = true;
        detectBtn.textContent = 'Processing...';

        // Get the image file from input
        const file = fileInput.files[0];
        if (!file) return;

        // Create form data
        const formData = new FormData();
        formData.append('image', file);

        // Get CSRF token from cookie if present
        function getCookie(name) {
            let cookieValue = null;
            if (document.cookie && document.cookie !== '') {
                const cookies = document.cookie.split(';');
                for (let i = 0; i < cookies.length; i++) {
                    const cookie = cookies[i].trim();
                    if (cookie.substring(0, name.length + 1) === (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }

        const csrftoken = getCookie('csrftoken');

        // Send to Django backend
        fetch('/api/detect/', {
            method: 'POST',
            body: formData,
            headers: csrftoken ? {
                'X-CSRFToken': csrftoken
            } : {}
        })
            .then(response => {
                if (!response.ok) {
                    console.error('Server response:', response.status, response.statusText);
                    throw new Error('Network response was not ok: ' + response.status);
                }
                return response.json();
            })
            .then(data => {
                console.log('Success:', data);
                if (data.success) {
                    displayResults(data);
                } else {
                    throw new Error(data.error || 'Unknown error occurred');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error processing image. Please try again.' + (error.message ? ' (' + error.message + ')' : ''));
            })
            .finally(() => {
                detectBtn.disabled = false;
                detectBtn.textContent = 'Detect Elements';
            });
    });

    // Update the displayResults function to handle just the original image URL
    function displayResults(data) {
        // Show the results section
        detectionResults.hidden = false;
        resultsPlaceholder.style.display = 'none';

        // Display processed image with bounding boxes
        detectionImageContainer.innerHTML = '';

        if (data.image_base64) {
            // Use the processed image from the server with bounding boxes already drawn
            const processedImg = document.createElement('img');
            processedImg.src = data.image_base64;
            processedImg.className = 'detection-image';
            detectionImageContainer.appendChild(processedImg);

            // Add a note about Cloudinary storage
            if (data.cloudinary_url) {
                const cloudinaryNote = document.createElement('div');
                cloudinaryNote.className = 'cloudinary-note mt-2 text-sm text-gray-600';
                cloudinaryNote.innerHTML = `
                <p>Image stored in Cloudinary for future training.</p>
            `;
                detectionImageContainer.appendChild(cloudinaryNote);
            }
        }

        // Populate table
        detectionTable.innerHTML = '';
        data.detections.forEach(detection => {
            const row = document.createElement('tr');

            // Class ID
            const classIdCell = document.createElement('td');
            classIdCell.textContent = detection.class_id;
            row.appendChild(classIdCell);

            // Class Name
            const classNameCell = document.createElement('td');
            classNameCell.textContent = detection.class_name;
            row.appendChild(classNameCell);

            // Confidence
            const confCell = document.createElement('td');
            confCell.textContent = detection.confidence.toFixed(4);
            row.appendChild(confCell);

            detectionTable.appendChild(row);
        });
    }
});