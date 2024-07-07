import os
import shutil
import random
import numpy as np
from PIL import Image
from gradio_client import Client, handle_file
import firebase_admin
from firebase_admin import credentials, storage, firestore
import uuid
from litellm import completion
from sklearn.cluster import KMeans
import config  # Import the config file

# Initialize Firebase
cred = credentials.Certificate(config.FIREBASE_CREDENTIALS_PATH)
firebase_admin.initialize_app(cred, {
    'storageBucket': config.FIREBASE_STORAGE_BUCKET,
    'databaseURL': config.FIREBASE_DATABASE_URL
})

def generate_product_name(garment_name, logo_name):
    prompt = f"Generate a creative and catchy product name for a garment named '{garment_name}' combined with a logo named '{logo_name}'. The name should be concise and appealing to customers. Output only the GENERATED_NAME"
    
    response = completion(
        model=config.AI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=config.MAX_TOKENS
    )
    
    return response.choices[0].message.content.strip()

# ... (other functions remain the same) ...

def generate_product_name(garment_name, logo_name):
    prompt = f"Generate a creative and catchy product name for a garment named '{garment_name}' combined with a logo named '{logo_name}'. The name should be concise and appealing to customers. Output only the GENERATED_NAME"
    
    response = completion(
        model=config.AI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=config.MAX_TOKENS
    )
    
    return response.choices[0].message.content.strip()


def get_image_files(directory):
    return [f for f in os.listdir(directory) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]

def upload_to_firebase(image_path):
    unique_filename = f"{uuid.uuid4()}.webp"
    bucket = storage.bucket()
    blob = bucket.blob(unique_filename)
    content_type = 'image/webp'
    
    try:
        with open(image_path, 'rb') as image_file:
            blob.upload_from_file(image_file, content_type=content_type)
        
        blob.metadata = {'firebaseStorageDownloadTokens': str(uuid.uuid4())}
        blob.patch()
        blob.make_public()
        return blob.public_url, f"gs://magifactory2.appspot.com/{unique_filename}"
    except Exception as e:
        print(f"An error occurred while uploading the file: {e}")
        return None, None


def get_dominant_color(image_path, n_colors=1):
    img = Image.open(image_path).convert('RGB')
    img = img.resize((100, 100))
    img_array = np.array(img).reshape((-1, 3))
    
    kmeans = KMeans(n_clusters=n_colors)
    kmeans.fit(img_array)
    
    colors = kmeans.cluster_centers_
    return colors[0]  # Return the most dominant color

def color_distance(color1, color2):
    return np.sqrt(np.sum((color1 - color2)**2))

def find_closest_color_match(target_color, color_list):
    distances = [color_distance(target_color, color) for color in color_list]
    return color_list[np.argmin(distances)]

def get_dominant_colors_with_frequency(image_path, n_colors=3):
    img = Image.open(image_path).convert('RGB')
    img = img.resize((100, 100))
    img_array = np.array(img).reshape((-1, 3))
    
    kmeans = KMeans(n_clusters=n_colors)
    labels = kmeans.fit_predict(img_array)
    
    colors = kmeans.cluster_centers_
    color_frequencies = np.bincount(labels) / len(labels)
    
    # Sort colors by frequency
    sorted_indices = np.argsort(color_frequencies)[::-1]
    
    return colors[sorted_indices], color_frequencies[sorted_indices]

def color_distance(color1, color2):
    return np.sqrt(np.sum((color1 - color2)**2))

def analyze_garments(garment_dir):
    garment_data = []
    
    for garment in os.listdir(garment_dir):
        if garment.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            garment_path = os.path.join(garment_dir, garment)
            colors, frequencies = get_dominant_colors_with_frequency(garment_path)
            
            garment_data.append({
                'path': garment_path,
                'colors': colors,
                'frequencies': frequencies
            })
    
    return garment_data

def select_matching_garments(logo_path, garment_data, num_garments=3, color_threshold=100, frequency_threshold=0.3):
    logo_colors, logo_frequencies = get_dominant_colors_with_frequency(logo_path)
    
    matching_garments = []
    
    for logo_color, logo_freq in zip(logo_colors, logo_frequencies):
        if logo_freq < frequency_threshold:
            continue  # Skip less prominent colors
        
        for garment in garment_data:
            for garment_color, garment_freq in zip(garment['colors'], garment['frequencies']):
                if garment_freq < frequency_threshold:
                    continue  # Skip less prominent colors
                
                if color_distance(logo_color, garment_color) < color_threshold:
                    matching_garments.append(garment['path'])
                    if len(matching_garments) == num_garments:
                        return matching_garments
    
    # If we don't have enough matches, add random garments
    remaining_garments = [g['path'] for g in garment_data if g['path'] not in matching_garments]
    matching_garments.extend(np.random.choice(remaining_garments, num_garments - len(matching_garments), replace=False))
    
    return matching_garments[:num_garments]


def process_image_pair(logo_path, garment_path, output_path, center_w=config.LOGO_CENTER_W, center_h=config.LOGO_CENTER_H, desired_color=None):
    img_logo = Image.open(logo_path).convert('RGBA')
    img_garment = Image.open(garment_path).convert('RGBA')

    # Calculate new size while maintaining aspect ratio
    logo_aspect_ratio = img_logo.width / img_logo.height
    new_height = int(img_garment.height * config.LOGO_RESIZE_HEIGHT_RATIO)
    new_width = int(new_height * logo_aspect_ratio)

    # Ensure the logo isn't wider than the garment
    if new_width > img_garment.width:
        new_width = int(img_garment.width * config.LOGO_MAX_WIDTH_RATIO)
        new_height = int(new_width / logo_aspect_ratio)

    img_logo_resized = img_logo.resize((new_width, new_height), Image.LANCZOS)

    # Calculate offset to center the logo
    offset_x = int(img_garment.width * center_w - new_width / 2)
    offset_y = int(img_garment.height * center_h - new_height / 2)
    offset = (offset_x, offset_y)

    new_img_logo = Image.new('RGBA', img_garment.size, (0, 0, 0, 0))
    new_img_logo.paste(img_logo_resized, offset)

    arr_logo = np.array(new_img_logo)
    arr_garment = np.array(img_garment)

    # Get top 3 dominant colors with their frequencies
    dominant_colors, color_frequencies = get_dominant_colors_with_frequency(logo_path, n_colors=3)
    
    apply_mask = False
    selected_color = None
    
    # Check if there's a dominant color based on frequency
    if color_frequencies[0] > config.FREQUENCY_THRESHOLD:
        selected_color = dominant_colors[0]
        
        # If a desired color is specified, check the distance
        if desired_color is not None:
            if color_distance(selected_color, np.array(desired_color)) < config.COLOR_DISTANCE_THRESHOLD:
                apply_mask = True
            else:
                print(f"Dominant color too different from desired color for logo: {os.path.basename(logo_path)}")
        else:
            apply_mask = True
    else:
        print(f"No dominant color found for logo: {os.path.basename(logo_path)}")
    
    if apply_mask and selected_color is not None:
        color_distances = np.sqrt(np.sum((arr_logo[:,:,:3] - selected_color)**2, axis=-1))
        mask = color_distances > config.COLOR_RANGE
        arr_logo[:,:,3] = np.where(mask, arr_logo[:,:,3], 0)
        print(f"Applying color-based mask for logo: {os.path.basename(logo_path)}")
    else:
        print(f"Keeping full logo for: {os.path.basename(logo_path)}")

    result = Image.alpha_composite(img_garment, Image.fromarray(arr_logo))
    result.save(output_path)
    return output_path

def process_logo(client, logo_path, garment_paths, background_images, output_folder, desired_color=None):
    results = []
    
    for garment_path in garment_paths:
        processed_garment_path = os.path.join(output_folder, f"processed_{os.path.basename(logo_path)}_{os.path.basename(garment_path)}")
        process_image_pair(logo_path, garment_path, processed_garment_path, center_w=config.LOGO_CENTER_W, center_h=config.LOGO_CENTER_H, desired_color=desired_color)
        
        logo_url, logo_gs_path = upload_to_firebase(logo_path)
        garment_url, garment_gs_path = upload_to_firebase(garment_path)
        processed_garment_url, processed_garment_gs_path = upload_to_firebase(processed_garment_path)
        
        for _ in range(config.NUM_BACKGROUNDS_PER_GARMENT):
            background_image = random.choice(background_images)
            background_path = os.path.join(config.BACKGROUND_DIR, background_image)
            
            result = client.predict(
                dict={"background": handle_file(background_path), "layers": [], "composite": None},
                garm_img=handle_file(processed_garment_path),
                garment_des="",
                is_checked=True,
                is_checked_crop=True,
                denoise_steps=config.DENOISE_STEPS,
                seed=config.SEED,
                api_name="/tryon"
            )
            
            image_path = result[0]
            public_url, gs_path = upload_to_firebase(image_path)
            if public_url and gs_path:
                results.append({
                    "background": os.path.splitext(background_image)[0],
                    "public_url": public_url,
                    "gs_path": gs_path
                })
        
        # Generate product name
        logo_name = os.path.splitext(os.path.basename(logo_path))[0]
        garment_name = os.path.splitext(os.path.basename(garment_path))[0]
        product_name = generate_product_name(garment_name, logo_name)
        
        # Create a new product document
        doc_ref = firestore_db.collection('products').document()
        doc_ref.set({
            'name': product_name,
            'price': config.PRODUCT_PRICE,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'tryons': results,
            'original_logo': {
                'public_url': logo_url,
                'gs_path': logo_gs_path
            },
            'original_garment': {
                'public_url': garment_url,
                'gs_path': garment_gs_path
            },
            'processed_garment': {
                'public_url': processed_garment_url,
                'gs_path': processed_garment_gs_path
            }
        })
        print(f"Firestore document created with ID: {doc_ref.id}")
    
    return results

# Ensure output directory exists
os.makedirs(config.OUTPUT_DIR, exist_ok=True)

# Get lists of image files
background_images = get_image_files(config.BACKGROUND_DIR)
garment_images = get_image_files(config.GARMENT_DIR)
logo_images = get_image_files(config.LOGOS_DIR)

# Ensure there are images in all directories
if not background_images or not garment_images or not logo_images:
    raise ValueError("One or more image directories are empty")

client = Client(config.API_URL)

# Initialize Firestore
firestore_db = firestore.client()

garment_paths = [os.path.join(config.GARMENT_DIR, garment) for garment in garment_images]

garment_data = analyze_garments(config.GARMENT_DIR)

# In the main loop where logos are processed
for logo_image in logo_images:
    logo_path = os.path.join(config.LOGOS_DIR, logo_image)
    matching_garments = random.choices(select_matching_garments(logo_path, garment_data), k=1)
    
    results = process_logo(client, logo_path, matching_garments, background_images, config.OUTPUT_DIR)
    
    if not results:
        print(f"Failed to process logo: {logo_image}")