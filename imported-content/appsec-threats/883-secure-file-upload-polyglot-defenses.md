# Secure File Upload Architecture: Defeating Polyglot Files and Execute Bypass

## The Problem: The Illusion of Magic Bytes and Extensions

File upload endpoints represent one of the most critical attack surfaces in web applications. A flawed implementation allows attackers to upload executable scripts (e.g., PHP, JSP, ASP, Python) and trigger Remote Code Execution (RCE).

Developers often attempt to secure file uploads by validating the file extension (e.g., ensuring it ends in `.jpg`) or inspecting the file's "magic bytes" (the header bytes that denote file type, such as `FF D8 FF E0` for JPEG). 

Attackers effortlessly bypass these checks using **Polyglot Files**—files that are valid in multiple formats simultaneously. An attacker can craft a valid image file that contains a PHP payload in its EXIF metadata. If the server validates the magic bytes, it sees a valid image. If the web server configuration allows execution of `.php` files, and the attacker names the file `image.php.jpg` (or utilizes a path traversal to drop it in a CGI-executable directory), the server parses the image metadata as executable code.

## The Mechanics: True Isolation and Image Sanitization

To secure file uploads, validation is insufficient. You must implement a three-pillared architecture:
1. **Storage Isolation:** Uploads must never reside on the web server's local file system. 
2. **Execution Prevention:** The storage location must not possess a script execution engine.
3. **Destructive Sanitization:** Files must be entirely re-written to strip malicious payloads.

### Architectural Diagram: Secure Upload Pipeline

```text
[ Attacker ] ---> (Polyglot image.jpg + PHP payload) 
                       |
                       v
            [ API Web Tier (Python/Node) ]
            1. Authenticate & Authorize
            2. Generate S3 Pre-signed URL
                       |
                       v
[ Attacker ] ---> [ Direct Upload to S3 Bucket ] (Staging Bucket)
                       |
                       v
            [ Lambda Function / Serverless ] (Triggered by Object Create)
            1. Download file to isolated /tmp
            2. Re-encode image via Vips/ImageMagick (Strips EXIF/Payloads)
            3. Generate safe UUID filename (e.g., f8a2...3b1.jpg)
                       |
                       v
            [ S3 Bucket (Production) ] <-- CDN / CloudFront --> [ Users ]
```

By forcing the client to upload directly to an S3 bucket via a pre-signed URL, the web server never touches the raw bytes. The S3 bucket simply serves static objects; it has no PHP/Java execution engine.

## Implementation: Destructive Sanitization via Re-encoding

If the application requires images (avatars, receipts), do not merely validate the image—**re-encode it**. Re-encoding parses the image pixels into memory and writes a brand new file, completely destroying non-standard payloads hidden in metadata or trailing bytes.

### Robust Code: Python Image Sanitizer (Using Pillow)

This serverless function processes uploaded files, aggressively strips all metadata, normalizes the format, and writes a clean, untainted image.

```python
import os
import uuid
import boto3
from PIL import Image, ImageOps
import io

s3_client = boto3.client('s3')

def sanitize_and_store_image(bucket_name, object_key, raw_bytes):
    try:
        # Load the image into PIL (forces parsing of image structure)
        image = Image.open(io.BytesIO(raw_bytes))
        
        # Verify the format is somewhat expected before processing
        if image.format not in ['JPEG', 'PNG', 'WEBP']:
            raise ValueError("Unsupported image format")

        # Strip EXIF metadata by creating a new image without info
        clean_image = Image.new(image.mode, image.size)
        clean_image.putdata(list(image.getdata()))
        
        # Normalize to standard RGB if necessary
        if clean_image.mode in ('RGBA', 'P'):
            clean_image = clean_image.convert('RGB')

        # Write to a new in-memory buffer as a pure JPEG
        output_buffer = io.BytesIO()
        clean_image.save(output_buffer, format='JPEG', quality=85)
        output_buffer.seek(0)
        
        # Generate a cryptographic, non-guessable filename
        safe_filename = f"{uuid.uuid4().hex}.jpg"
        
        # Upload the sanitized image to the production bucket
        s3_client.put_object(
            Bucket=bucket_name,
            Key=f"public/avatars/{safe_filename}",
            Body=output_buffer,
            ContentType='image/jpeg',
            # Enforce Content-Disposition to prevent inline execution in browsers
            ContentDisposition='attachment',
            # Apply strict caching and WAF rules via metadata
            CacheControl='max-age=31536000'
        )
        
        return safe_filename

    except Exception as e:
        print(f"Sanitization failed: {e}")
        # Log failure, do NOT process or move the file
        return None
```

## Conclusion

File upload security requires assuming all incoming bytes are actively malicious. By combining infrastructure-level isolation (S3 and Pre-signed URLs) with destructive programmatic sanitization (re-encoding), organizations can neutralize polyglots, bypasses, and RCE threats, rendering malicious uploads inert.
