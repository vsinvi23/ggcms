---
title: "How DNS Resolution Actually Works: From Root Servers to Anycast"
description: "The full DNS resolution path from browser cache to authoritative nameserver, why CNAME lookups cost an extra round trip, how Anycast lets 8.8.8.8 serve the whole planet from one IP, and a working Node.js resolver trace."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "dns"
  - "anycast"
  - "networking"
  - "name-resolution"
  - "bgp"
  - "load-balancing"
---

# How DNS Resolution Actually Works: From Root Servers to Anycast

## The Problem

Humans navigate the web with domain names (`api.serenya.com`); every router, load balancer, and TCP stack between a client and a server routes traffic using IP addresses (`192.0.2.1`). Something has to map billions of domain-name lookups per second onto IP addresses, globally, with low latency and no single point of failure. That something is the **Domain Name System (DNS)**.

Get this wrong in a production system — say, by assuming a DNS record change propagates instantly — and you'll ship a "zero-downtime" deploy that actually serves the old server to a slice of users for minutes or hours, because of caching layers you didn't account for.

## The Mental Model

DNS is not one giant global phonebook — it is a **hierarchical delegation of phonebooks**. To find a phone number for someone in a specific city, you don't query a single global directory; you ask a top-level directory for the country's directory, the country for the state's, the state for the city's, and the city directory for the person. No single server has to hold, or answer for, the entire namespace.

## The Resolution Path

Before a query ever reaches the internet, it passes through several caching layers a request handler needs to understand:

1. **Browser cache** — the browser checks its own DNS cache first.
2. **OS resolver cache** — the operating system's stub resolver checks next.
3. **Recursive resolver** — the query reaches an ISP resolver or a public one like Google's `8.8.8.8` or Cloudflare's `1.1.1.1`.

If the recursive resolver has no cached answer, it performs an iterative lookup down the hierarchy:

```text
 Client               Recursive Resolver         Root (.)         TLD (.com)         Authoritative (serenya.com)
   │                        │                       │                 │                        │
   │─ Where is serenya.com? ▶│                       │                 │                        │
   │                        │── Where is .com? ─────▶│                 │                        │
   │                        │◀── ask these TLD servers│                 │                        │
   │                        │── Where is serenya.com? ─────────────────▶│                        │
   │                        │◀── ask these authoritative servers ───────│                        │
   │                        │── What is the IP for serenya.com? ───────────────────────────────▶│
   │                        │◀── 192.0.2.1 ────────────────────────────────────────────────────────│
   │◀── 192.0.2.1 ──────────│                       │                 │                        │
```

1. **Root nameserver (`.`)** — knows only where the Top-Level Domain servers are (`.com`, `.org`, `.io`, ...).
2. **TLD nameserver (`.com`)** — knows where the authoritative servers for the specific domain are.
3. **Authoritative nameserver** — holds the actual DNS records for `serenya.com` and returns the final answer.

## Core DNS Record Types

- **A record** — maps a hostname to an IPv4 address.
- **AAAA record** — maps a hostname to an IPv6 address.
- **CNAME (Canonical Name)** — aliases a hostname to another hostname. Useful when multiple subdomains share the same backing infrastructure, but every CNAME hop the resolver follows costs an additional lookup round trip.
- **ALIAS / ANAME** — a non-standard record type offered by managed DNS providers (e.g. AWS Route 53) that behaves like a CNAME but is legal at the zone apex and resolves without the second-lookup penalty.

## Inspecting the Resolution Path Yourself

```bash
# Trace the full delegation chain from root down to the authoritative answer
dig +trace serenya.com

# Ask a specific resolver directly and see the TTL on the returned record
dig @8.8.8.8 serenya.com A +noall +answer
```

```javascript
// Node.js: perform a real DNS lookup and inspect the resolved address + TTL behavior.
const dns = require('node:dns').promises;

async function resolveWithTiming(hostname) {
  const start = performance.now();
  const addresses = await dns.resolve4(hostname);
  const elapsedMs = performance.now() - start;

  console.log(`${hostname} -> ${addresses.join(', ')} (resolved in ${elapsedMs.toFixed(1)}ms)`);
  return addresses;
}

resolveWithTiming('serenya.com');
// A cold lookup (cache miss) typically takes tens of milliseconds;
// a warm OS-cache hit resolves in well under 1ms.
```

## Scaling Public Resolvers with Anycast

A public resolver like `8.8.8.8` handles enormous traffic volume. If it were one physical server in a single data center, a user in Tokyo querying it would suffer a long round trip to California. DNS solves this with **Anycast routing**: multiple physical servers around the world all advertise the *same* IP address (`8.8.8.8`) via BGP (Border Gateway Protocol).

```text
                          BGP advertises 8.8.8.8 from multiple PoPs
   ┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
   │  PoP: SFO │      │  PoP: LHR │      │  PoP: NRT │      │  PoP: SYD │
   └─────┬─────┘      └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
         │                  │                  │                  │
   User in US-West    User in Europe      User in Tokyo      User in Sydney
   routed to SFO      routed to LHR       routed to NRT      routed to SYD
```

When a user in Tokyo queries `8.8.8.8`, the internet's own BGP routing infrastructure delivers the packet to the topologically nearest Point of Presence (in this case, the Tokyo node) — with no application-level routing decision required. This gives massive horizontal scalability and a built-in DDoS mitigation property: an attack aimed at `8.8.8.8` only lands on the nearest PoP, not on a single central server that the whole planet shares.

## Architectural Takeaway

DNS is effectively your first, cheapest layer of load balancing and failover — before a client even opens a TCP connection. Short TTLs enable relatively fast failover by controlling how long stale answers linger in caches, and DNS-level routing policies (weighted, latency-based, geolocation) can steer users toward the optimal region. But because browser and ISP caching sit outside your control, DNS alone cannot deliver sub-second failover — pair it with health-checked load balancers and connection-level retries for anything that needs to fail over instantly.
