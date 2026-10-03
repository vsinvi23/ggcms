---
title: "Video Streaming: Transcoding Pipelines and DASH Adaptive Bitrate"
description: "How Netflix-style platforms turn a single master video file into a distributed FFmpeg transcoding pipeline, then deliver it via DASH manifests, CDN edge caching, and client-side adaptive bitrate switching."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "video-transcoding"
  - "adaptive-bitrate-streaming"
  - "dash"
  - "cdn"
  - "ffmpeg"
---

# Video Streaming: Transcoding Pipelines and DASH Adaptive Bitrate

## The Problem: The Multi-Device Video Delivery Challenge

When a content creator uploads a 4K, 50GB master video file in ProRes format, that file cannot be streamed directly to end-users. A user watching on a 4K Smart TV with a 1Gbps fiber connection requires an entirely different video format and bitrate than a user watching on a 3G mobile network on an iPhone.

Furthermore, network conditions fluctuate during playback. If a user drives through a tunnel, their bandwidth drops; the video shouldn't buffer infinitely, it should gracefully drop in quality.

To solve this, platforms like Netflix and YouTube rely on a sophisticated pipeline involving massive distributed computing for **Transcoding**, edge caching via **CDNs**, and adaptive bitrate streaming via protocols like **DASH** (Dynamic Adaptive Streaming over HTTP) or **HLS**.

## The Architecture: The Video Transcoding Pipeline

When a raw video is uploaded to cloud storage (e.g., AWS S3), it triggers an event-driven architecture that orchestrates a distributed transcoding Directed Acyclic Graph (DAG).

1. **Inspection & Chunking:** The master file is too large to transcode on a single machine. A worker node inspects the file, extracts metadata, and chops the video into small chunks (e.g., 4-second segments) along keyframe boundaries.
2. **Parallel Transcoding:** These 4-second chunks are placed into a message queue (e.g., Kafka or SQS). A massive fleet of worker nodes pulls these chunks and transcodes them in parallel.
3. **Multi-Resolution Generation:** Each chunk is encoded into multiple resolution and bitrate profiles (e.g., 1080p @ 5Mbps, 720p @ 3Mbps, 480p @ 1Mbps, 360p @ 400kbps) using multiple codecs (H.264 for legacy devices, AV1/HEVC for modern devices).
4. **Stitching & Manifest Generation:** Once all chunks are processed, they are stored in an edge-accessible object store, and a master **Manifest File** (e.g., `.mpd` for DASH or `.m3u8` for HLS) is generated.

```text
[ Upload S3 ] -> [ Inspection Node ] -> Chunks (0-4s, 4-8s...) -> [ Queue ]
                                                                     |
       +-------------------------------------------------------------+
       |
[ Transcoder Worker A ] -> Generates 1080p, 720p, 480p chunks for 0-4s
[ Transcoder Worker B ] -> Generates 1080p, 720p, 480p chunks for 4-8s
[ Transcoder Worker C ] -> Generates 1080p, 720p, 480p chunks for 8-12s
       |
       v
[ Aggregator / Manifest Generator ] -> Outputs DASH (.mpd) Manifest
       |
       v
[ Origin Storage ] <---> [ CDN Edge Nodes (Open Connect) ]
```

## Robust Code: The Transcoding Worker

Under the hood, video workers often wrap powerful C-libraries like FFmpeg. Here is a simplified representation of a worker processing a chunk.

```python
import subprocess
import boto3

def transcode_chunk(s3_client, bucket, chunk_key):
    # Download raw 4-second chunk
    local_raw_path = f"/tmp/{chunk_key}"
    s3_client.download_file(bucket, chunk_key, local_raw_path)

    profiles = [
        {"name": "1080p", "scale": "1920:1080", "bitrate": "5000k"},
        {"name": "720p", "scale": "1280:720", "bitrate": "2800k"},
        {"name": "480p", "scale": "854:480", "bitrate": "1400k"}
    ]

    output_files = []
    for profile in profiles:
        output_path = f"/tmp/{profile['name']}_{chunk_key}"

        # Execute FFmpeg via subprocess
        # -y: overwrite, -i: input, -vf: video filter (scale), -b:v: video bitrate
        command = [
            "ffmpeg", "-y", "-i", local_raw_path,
            "-vf", f"scale={profile['scale']}",
            "-c:v", "libx264", "-b:v", profile["bitrate"],
            "-preset", "fast", output_path
        ]

        subprocess.run(command, check=True)

        # Upload transcoded chunk to Origin Storage
        s3_client.upload_file(output_path, bucket, f"transcoded/{profile['name']}/{chunk_key}")
        output_files.append(output_path)

    return "Transcoding Complete"
```

## Delivery: DASH and Adaptive Bitrate Streaming

Once transcoded, delivery relies on the manifest file and edge caching.

### How DASH Works

Instead of a continuous socket connection, DASH utilizes standard HTTP GET requests. The client player downloads the `.mpd` (Media Presentation Description) manifest file, which acts as a menu.

```xml
<!-- Simplified DASH Manifest -->
<MPD>
  <Representation id="1080p" bandwidth="5000000" width="1920" height="1080">
    <BaseURL>https://cdn.netflix.com/vid_1080/</BaseURL>
    <SegmentList duration="4"/>
  </Representation>
  <Representation id="480p" bandwidth="1400000" width="854" height="480">
    <BaseURL>https://cdn.netflix.com/vid_480/</BaseURL>
    <SegmentList duration="4"/>
  </Representation>
</MPD>
```

### The Client-Side Brain

Adaptive streaming intelligence lives entirely in the client-side video player (e.g., Shaka Player or video.js), not the server.

1. The player downloads chunk `0-4s` at 1080p.
2. It measures the download time. If the 4-second chunk took 3 seconds to download, network bandwidth is dropping.
3. For chunk `4-8s`, the player dynamically switches to requesting the 480p file from the CDN.
4. The transition is seamless because all chunk variations share identical keyframe boundaries.

### CDN Edge Caching

Because the video is just millions of tiny static `.m4s` or `.ts` HTTP files, they are perfectly cacheable by CDNs (Content Delivery Networks). When a popular show drops, the chunks are populated globally across edge nodes physically located inside ISPs. When you hit play, you are downloading those 4-second chunks from a server just a few miles away, bypassing the internet backbone entirely, achieving instant playback and zero buffering.
