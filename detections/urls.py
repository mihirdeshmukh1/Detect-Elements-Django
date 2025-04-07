from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/detect/', views.detect_elements, name='detect_elements'),
]
