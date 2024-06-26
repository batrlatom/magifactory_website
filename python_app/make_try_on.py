
#background_dir = '/IDM-VTON/people'
#garment_dir = '/IDM-VTON/garmets'

import os
import shutil
import random
from gradio_client import Client, handle_file
import firebase_admin
from firebase_admin import credentials, storage, db, firestore
import uuid

# Initialize Firebase (you need to replace 'path/to/your/serviceAccountKey.json' with your actual path)
cred = credentials.Certificate('account.json')
firebase_admin.initialize_app(cred, {
    'storageBucket': 'magifactory2.appspot.com',
    'databaseURL': 'https://magifactory2.firebaseio.com'
})

# Function to get all image files from a directory
def get_image_files(directory):
    return [f for f in os.listdir(directory) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]

# Directories for background and garment images
background_dir = '/IDM-VTON/people'
garment_dir = '/IDM-VTON/garmets'

# Get lists of image files
background_images = get_image_files(background_dir)
garment_images = get_image_files(garment_dir)

# Ensure there are images in both directories
if not background_images or not garment_images:
    raise ValueError("One or both image directories are empty")

# Choose random images
background_image = random.choice(background_images)
garment_image = random.choice(garment_images)

# Full paths to the chosen images
background_path = os.path.join(background_dir, background_image)
garment_path = os.path.join(garment_dir, garment_image)

client = Client("http://127.0.0.1:7860/")
result = client.predict(
    dict={"background": handle_file(background_path), "layers": [], "composite": None},
    garm_img=handle_file(garment_path),
    garment_des="",
    is_checked=True,
    is_checked_crop=False,
    denoise_steps=30,
    seed=42,
    api_name="/tryon"
)
print(result[0])

image_path = result[0]

# Generate a unique filename
unique_filename = f"{uuid.uuid4()}.webp"

# Upload file to Firebase Storage
bucket = storage.bucket()
blob = bucket.blob(unique_filename)

# Set the correct content type
content_type = 'image/webp'

# Upload the file
try:
    with open(image_path, 'rb') as image_file:
        blob.upload_from_file(image_file, content_type=content_type)
    
    # Set metadata after upload
    blob.metadata = {'firebaseStorageDownloadTokens': str(uuid.uuid4())}
    blob.patch()

    print(f"File {unique_filename} uploaded successfully with content type: {content_type}")
except Exception as e:
    print(f"An error occurred while uploading the file: {e}")
    exit(1)

# Make the blob publicly accessible
blob.make_public()

# Get the public URL
public_url = blob.public_url


# If Realtime Database fails, try using Firestore
try:
    firestore_db = firestore.client()
    doc_ref = firestore_db.collection('products').document()
    doc_ref.set({
        'imagePath': f"gs://magifactory2.appspot.com/{unique_filename}",
        'name': f"Combo: {os.path.splitext(background_image)[0]} + {os.path.splitext(garment_image)[0]}",
        'price': random.randint(1, 100)  # Random price between 1 and 100
    })
    print(f"Firestore document created with ID: {doc_ref.id}")
except Exception as e:
    print(f"Failed to create database entry: {e}")

print(f"Image uploaded to: {public_url}")

# Optionally, you can still save a local copy
destination_path = os.path.join("/IDM-VTON", "result_image.webp")
shutil.copy2(image_path, destination_path)

