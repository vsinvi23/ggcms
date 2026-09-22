# Designing Bitly: Base62 Encodings, Collision Prevention, and Key Generation Services

URL shorteners like Bitly or TinyURL seem like trivial applications—a basic key-value mapping of a short string to a long URL. However, at a global scale of billions of links and thousands of requests per second, the naive approaches of hashing and random string generation catastrophically fail.

In this article, we explore the architectural evolution of a URL shortener, focusing on the math of Base62 encoding and the necessity of a dedicated Key Generation Service (KGS).

## The Problem: Collisions and Hashing 

The initial instinct for generating a short URL is to hash the original long URL. 

If we use MD5, the output is a 128-bit hash (32 hex characters). This is entirely too long for a "short" URL. If we truncate the MD5 hash to the first 7 characters, we run into the **Birthday Paradox**. At scale, the probability of two different long URLs generating the exact same 7-character truncated hash (a collision) becomes a mathematical certainty. 

Furthermore, if two different users shorten the exact same long URL, a naive hash function will output the exact same short URL, preventing us from tracking user-specific click analytics.

## The Solution: Base62 Encoding

Instead of hashing the URL, we can treat the short URL as a mathematical conversion from a unique Base-10 integer. 

### The Mental Model: The Deli Ticket Dispenser

When you walk into a crowded deli, you don't roll a 10,000-sided die hoping no one else rolled your number. You pull a sequential ticket from a dispenser. 

Similarly, our database can generate a highly scalable, guaranteed-unique Auto-Incrementing ID (a Base-10 integer) for every new URL. We then mathematically convert that Base-10 integer into a shorter string representation using **Base62**.

Base62 utilizes 62 characters: `[a-z, A-Z, 0-9]`. 
If our short URL is 7 characters long, we can represent $62^7$ unique URLs, which equates to **3.5 trillion** combinations. 

### The Base62 Conversion Algorithm

```python
def encode_base62(num):
    characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    base = 62
    encoded_string = ""
    
    if num == 0:
        return characters[0]
        
    while num > 0:
        remainder = num % base
        encoded_string = characters[remainder] + encoded_string
        num = num // base
        
    return encoded_string

# Example: Ticket ID 125,000,000 becomes "8m0cW"
```

## The Distributed Bottleneck: Scaling the Ticket Dispenser

While converting an integer to Base62 is fast, the bottleneck becomes the database's auto-incrementing ID. In a distributed environment with multiple app servers, relying on a single relational database for sequential ID generation creates a massive single point of failure and a throughput choke point.

### The Key Generation Service (KGS)

To scale, system architects introduce a standalone component called the **Key Generation Service (KGS)**. 

The KGS acts as a pre-compiler. It constantly generates unique Base62 strings in the background and stores them in a highly available NoSQL database or a fast memory cache.

```text
[App Server 1] ---> Requests 1,000 keys ---> [KGS] ---> [Key DB]
[App Server 2] ---> Requests 1,000 keys ---> [KGS]
```

1. **Pre-Allocation:** When an application server boots up, it asks the KGS for a batch of 1,000 pre-generated short keys. 
2. **Local Caching:** The app server caches these keys in local memory.
3. **Instant Provisioning:** When a user requests a short URL, the app server simply pops a key off its local memory stack and pairs it with the long URL.
4. **Zero Collisions:** Because the KGS ensures it never hands the same batch of keys to two different servers, collisions are physically impossible.

### Handling App Server Crashes

If an app server crashes, the keys remaining in its local memory are lost. In a space of 3.5 trillion possible URLs, losing a few hundred keys is a completely acceptable trade-off for the massive performance gains of local memory provisioning.

By shifting from unpredictable hashing to deterministic Base62 encoding—and decoupling key generation into a standalone KGS pipeline—a URL shortener can scale horizontally to handle internet-scale traffic with zero risk of collision.