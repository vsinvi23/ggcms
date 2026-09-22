# Designing Netflix: Video Transcoding Pipelines, CDN Caching, and DASH Adaptive Streaming

## The Problem: Heterogeneous Devices and Variable Bandwidth
Delivering video at scale requires serving content to thousands of device types (4K Smart TVs, older smartphones, web browsers) over highly volatile network conditions. Serving a single massive 4K video file to a mobile user on a 3G network results in infinite buffering. We need a system that adapts video quality in real-time.

## 1. The Ingestion and Transcoding Pipeline
When a raw video file (often a massive ProRes or ProRes 4444 master) is uploaded, it must be converted into multiple formats, resolutions, and bitrates. This process is called transcoding.

### Distributed Transcoding Architecture
Transcoding is CPU-intensive. A single master file is split into small chunks (e.g., 5-second segments), and these chunks are processed in parallel.

```text
[Raw Video Master]
       |
 [Chunk Splitter] -> Chunks (0-5s, 5-10s, ...)
       |
   [Message Queue (Kafka)]
       |
 +-------------------------------+
 | Worker Pool (FFmpeg/FFprobe)  |
 | -> 1080p, 5Mbps, H.264        |
 | -> 720p,  3Mbps, H.264        |
 | -> 480p,  1Mbps, H.264        |
 | -> 4K,   15Mbps, HEVC/H.265   |
 +-------------------------------+
       |
 [Assembler / Packager] -> Generates Dash (.mpd) / HLS (.m3u8) manifests
       |
 [Object Storage (S3)]
```

## 2. Adaptive Bitrate Streaming (DASH / HLS)
Modern streaming does not use continuous TCP streams. It uses HTTP-based adaptive bitrate streaming (ABR), primarily MPEG-DASH or Apple HLS.

### How it Works
The packager generates a manifest file (e.g., `.mpd` for DASH) that lists the available resolutions and the URLs for every 5-second chunk of the video at each resolution.

**Code Example: Simplified DASH Manifest (.mpd structure)**
```xml
<MPD>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="5000000" width="1920" height="1080">
        <BaseURL>1080p/</BaseURL>
        <SegmentList><SegmentURL media="chunk_1.m4s"/><SegmentURL media="chunk_2.m4s"/></SegmentList>
      </Representation>
      <Representation id="2" bandwidth="1000000" width="854" height="480">
        <BaseURL>480p/</BaseURL>
        <SegmentList><SegmentURL media="chunk_1.m4s"/><SegmentURL media="chunk_2.m4s"/></SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

The Client (Video Player) drives the intelligence:
1. Downloads the Manifest.
2. Measures current bandwidth.
3. Requests `chunk_1` at 1080p.
4. If bandwidth drops, requests `chunk_2` at 480p.
Because chunks are fetched via standard HTTP GET requests, they are highly cacheable.

## 3. CDN Caching Strategy
A Content Delivery Network (CDN) caches the video chunks at the Edge, as close to the user as possible (e.g., an ISP's local data center).

### Cache Hierarchies
- **Edge Cache:** Located within ISPs. Holds the most popular content.
- **Regional/Mid-tier Cache:** Serves Edge caches on a cache miss.
- **Origin (S3):** The source of truth.

When a client requests `1080p/chunk_1.m4s`, the Edge CDN checks its cache. If it's a miss, it pulls from the Regional Cache. 

By utilizing chunked HTTP requests, distributed parallel transcoding, and aggressive CDN caching, video streaming platforms achieve near-instant playback and zero buffering despite network volatility.
