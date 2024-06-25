import requests
import random
import string

response = requests.post(
    f"https://api.stability.ai/v2beta/stable-image/generate/sd3",
    headers={
        "authorization": f"sk-UNA8sSXE1hQbvwRtAykUpMRuDIZzqS18nVZMnjEfAQ5ssVIi",
        "accept": "image/*"
    },
    files={"none": ''},
    data={
        "prompt": "product photo of a white t-shirt on a man",
        "output_format": "png",
    },
)

if response.status_code == 200:

    letters = string.ascii_lowercase + string.digits
    name = ''.join(random.choice(letters) for i in range(10))
    with open(f"{name}.png", 'wb') as file:
        file.write(response.content)
else:
    raise Exception(str(response.json()))


