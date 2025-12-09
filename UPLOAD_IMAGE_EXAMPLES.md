# How to Upload Cover Image in JSON Format

The API supports uploading images in JSON format using base64 encoding.

## Format

The `cover_image` field must be in this format:
```
data:image/<type>;base64,<base64-encoded-data>
```

## Supported Image Types
- `image/png`
- `image/jpeg` or `image/jpg`
- `image/gif`
- `image/webp`
- `image/svg+xml`

## Examples

### 1. Using curl with base64 encoded image

First, convert your image to base64:
```bash
# On macOS/Linux
base64 -i image.png

# Or using a file
base64 image.png > image_base64.txt
```

Then use it in your curl request:
```bash
curl -X 'POST' \
  'http://localhost:5001/api/courses' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
  "name": "Diagnostic Tools",
  "slug": "diagnostic-tools",
  "description": "Course description",
  "price": 49.99,
  "cover_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "icon_name": "diagnostic-icon"
}'
```

### 2. Using a script to generate the full payload

Create a file `upload_course.sh`:
```bash
#!/bin/bash

IMAGE_FILE="path/to/your/image.png"
IMAGE_BASE64=$(base64 -i "$IMAGE_FILE")
IMAGE_TYPE=$(file -b --mime-type "$IMAGE_FILE")
IMAGE_DATA="data:${IMAGE_TYPE};base64,${IMAGE_BASE64}"

curl -X 'POST' \
  'http://localhost:5001/api/courses' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d "{
  \"name\": \"Diagnostic Tools\",
  \"slug\": \"diagnostic-tools\",
  \"description\": \"Course description\",
  \"price\": 49.99,
  \"cover_image\": \"${IMAGE_DATA}\",
  \"icon_name\": \"diagnostic-icon\"
}"
```

### 3. Using Node.js

```javascript
const fs = require('fs');
const axios = require('axios');

// Read image file
const imagePath = './image.png';
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');
const imageType = 'image/png'; // or detect from file

// Create the payload
const payload = {
  name: "Diagnostic Tools",
  slug: "diagnostic-tools",
  description: "Course description",
  price: 49.99,
  cover_image: `data:${imageType};base64,${imageBase64}`,
  icon_name: "diagnostic-icon"
};

// Make the request
axios.post('http://localhost:5001/api/courses', payload, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  }
})
.then(response => console.log(response.data))
.catch(error => console.error(error));
```

### 4. Using Python

```python
import base64
import requests
import json

# Read and encode image
with open('image.png', 'rb') as image_file:
    image_base64 = base64.b64encode(image_file.read()).decode('utf-8')

# Create payload
payload = {
    "name": "Diagnostic Tools",
    "slug": "diagnostic-tools",
    "description": "Course description",
    "price": 49.99,
    "cover_image": f"data:image/png;base64,{image_base64}",
    "icon_name": "diagnostic-icon"
}

# Make request
response = requests.post(
    'http://localhost:5001/api/courses',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN'
    },
    data=json.dumps(payload)
)

print(response.json())
```

## Quick Test

To quickly test with a small image:

```bash
# Create a small test image (1x1 pixel PNG)
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > test.png

# Convert to base64
BASE64=$(base64 -i test.png)

# Use in curl
curl -X 'POST' \
  'http://localhost:5001/api/courses' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d "{
  \"name\": \"Test Course\",
  \"slug\": \"test-course\",
  \"description\": \"Test\",
  \"price\": 10.00,
  \"cover_image\": \"data:image/png;base64,${BASE64}\",
  \"icon_name\": \"test\"
}"
```

## Notes

- The base64 string can be very long for large images
- Maximum file size: 10MB
- The image will be saved to `uploads/images/` directory
- A unique filename will be generated automatically
- The API will return the URL of the uploaded image

