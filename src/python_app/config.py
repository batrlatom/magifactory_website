# Firebase configuration
FIREBASE_STORAGE_BUCKET = 'magifactory2.appspot.com'
FIREBASE_DATABASE_URL = 'https://magifactory2.firebaseio.com'
FIREBASE_CREDENTIALS_PATH = 'account.json'

# Image processing
LOGO_RESIZE_HEIGHT_RATIO = 0.3
LOGO_MAX_WIDTH_RATIO = 0.8
LOGO_CENTER_W = 0.5
LOGO_CENTER_H = 0.4
COLOR_RANGE = 20
FREQUENCY_THRESHOLD = 0.4
COLOR_DISTANCE_THRESHOLD = 100
COLOR_MATCH_THRESHOLD = 100

# AI model
AI_MODEL = "anthropic/claude-3-haiku-20240307"
MAX_TOKENS = 50

# File paths
BACKGROUND_DIR = '/IDM-VTON/people'
GARMENT_DIR = '/IDM-VTON/garmets'
LOGOS_DIR = '/IDM-VTON/logos'
OUTPUT_DIR = '/IDM-VTON/output'

# API
API_URL = "http://127.0.0.1:7860/"

# Product details
PRODUCT_PRICE = 749

# Image generation
NUM_BACKGROUNDS_PER_GARMENT = 1
DENOISE_STEPS = 40
SEED = -1
