---
title: "Designing a Global CDN: Edge Caching and Invalidation"
description: "How CDN Points of Presence route users to the nearest edge node, why cache invalidation is one of the hardest problems in computer science, and the three practical strategies — versioning, TTL tuning, and active purging — that solve it."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "cdn"
  - "cache-invalidation"
  - "edge-computing"
  - "cache-control"
  - "content-delivery-network"
---

# Designing a Global CDN: Edge Caching and Invalidation

## The Problem: The Speed of Light

No matter how perfectly optimized your backend servers are, you cannot cheat the speed of light. Data traveling over fiber-optic cables from a server in Virginia to a user in Tokyo takes time — typically around 150 to 200 milliseconds round-trip.

If an application requires 10 assets (HTML, CSS, JS, images) to render, the network latency alone creates a sluggish, multi-second loading experience for international users. Centralized hosting simply does not scale globally.

To provide sub-50ms load times to users worldwide, the data must physically reside closer to them. This is the primary function of a Content Delivery Network (CDN).

## The Mental Model: The Proxy Network

A CDN is a highly distributed network of proxy servers deployed in data centers across the globe. These locations are called **Points of Presence (PoPs)** or **Edge Nodes**.

When a user in Tokyo requests `hero-image.jpg`, the request doesn't go to Virginia (the **Origin Server**). Instead, DNS routing (usually Anycast) directs the user to the nearest PoP in Tokyo.

```text
                  +-------------+
             ---> | Tokyo Edge  | (Serves cached image)
            /     +-------------+
[ User in ]/
[  Japan  ]
            \     +-------------+
             ---> | Origin (US) | (Ignored!)
                  +-------------+
```

If Tokyo Edge has a copy of the image (a **Cache Hit**), it serves it instantly. If it doesn't (a **Cache Miss**), Tokyo Edge fetches the image from the Origin in Virginia, saves a copy to its local disk, and then serves it to the user. All subsequent users in Tokyo will now get the lightning-fast cache hit.

## Caching Strategies

### Static Asset Caching

The simplest use case for a CDN is static assets. You instruct the CDN to cache these files by sending HTTP `Cache-Control` headers from your Origin server.

```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
Cache-Control: public, max-age=31536000, immutable
```

The `max-age` directive tells the CDN (and the user's browser) to store this file for one year. The `immutable` directive promises the file content will never change.

### Dynamic Edge Computing

Modern CDNs (like Cloudflare, Fastly, or AWS CloudFront) do more than cache static files. They run **Edge Functions** (like Cloudflare Workers). You can execute lightweight JavaScript or WebAssembly directly on the edge node.

This allows for:

- Checking JWT authentication tokens before letting requests hit the Origin.
- A/B testing routing.
- Injecting security headers.
- Generating personalized HTML responses without ever touching your Virginia datacenter.

## The Hard Problem: Cache Invalidation

Phil Karlton famously said, *"There are only two hard things in Computer Science: cache invalidation and naming things."*

If a CDN holds a copy of your company logo for a year, what happens when you rebrand? If you just replace `logo.png` on the Origin server, users will still see the old logo because the CDN is serving its cached copy.

There are three main strategies to solve this:

### 1. Versioning (The Gold Standard)

Instead of naming your file `app.js`, you incorporate a hash of the file's contents into the filename (e.g., `app.v1a2b3c.js`).

When you release new code, the hash changes, resulting in `app.v9x8y7z.js`. The HTML references the new filename. Because the CDN has never seen this new filename, it treats it as a cache miss, fetching the new file from the Origin. The old file safely expires on its own.

### 2. Time-To-Live (TTL) Tuning

For semi-dynamic content (like a news homepage), you set a short TTL.

```text
Cache-Control: public, max-age=60
```

The CDN caches the page for exactly 60 seconds. This shields your database from massive traffic spikes (handling millions of hits from the cache) while ensuring content is never more than a minute out of date.

### 3. Active Purging

Sometimes you need immediate invalidation (e.g., taking down a legally problematic image). You can send an API request to the CDN to purge or invalidate a specific path.

```bash
# Example: Purging a URL in Cloudflare via API
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE/purge_cache" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"files":["https://example.com/logo.png"]}'
```

Purging is computationally expensive for the CDN provider, as they must broadcast the deletion command to hundreds of PoPs worldwide. It should be used for emergencies, not as your primary deployment strategy.

## Summary

A global CDN transforms a slow, centralized application into a distributed powerhouse. By aggressively versioning static assets, tuning TTLs for dynamic content, and pushing lightweight compute to the edge, architects can deliver 50ms response times to users globally while massively reducing the load (and cost) of their Origin servers.
