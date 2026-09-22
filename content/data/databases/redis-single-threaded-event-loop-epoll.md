---
title: "Redis Internals: The Single-Threaded Event Loop and Epoll"
description: "Why Redis's single-threaded execution model outperforms thread-per-connection servers, how the Linux epoll API multiplexes thousands of sockets, and how to benchmark and scale the event loop in production."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "redis"
  - "epoll"
  - "event-loop"
  - "io-multiplexing"
  - "concurrency"
  - "performance-tuning"
---

# Redis Internals: The Single-Threaded Event Loop and Epoll

## What We Are Going to Learn

In this deep-dive into database internals, we explore the network and concurrency architecture of **Redis** (Remote Dictionary Server). Specifically, we cover:

1. **The concurrency paradox** — why a single-threaded engine is often faster than a multi-threaded database.
2. **The CPU lock bottleneck** — how thread context-switching and mutex locks degrade system performance.
3. **I/O multiplexing with epoll** — how the Linux kernel's `epoll` API allows a single thread to monitor thousands of network sockets simultaneously.
4. **The Redis event loop** — the execution loop (`ae.c`) that coordinates network read/write events and database queries.

## The Problem: Thread Contention and Lock Overhead at Scale

When designing high-throughput servers, a common architectural pattern is to spawn a new OS thread (or process) per incoming client connection — the **thread-per-connection** model. It breaks down at scale:

* **Context switching latency** — the OS must continuously swap CPU registers, program counters, and stack pointers as it schedules different threads. Each swap invalidates CPU L1/L2 caches and costs hundreds of CPU cycles.
* **Memory exhaustion** — each OS thread allocates its own stack (typically 2–8 MB by default). Spawning 10,000 threads can consume 20–80 GB of RAM purely for thread overhead, leaving no room for database caching.
* **Mutex lock contention** — if multiple threads read/write the same in-memory data structure (a shared hash map), they must acquire mutexes to prevent race conditions. Threads spend more time waiting for lock releases than doing real work.

## Why the Problem Is Hard: Non-Blocking, High-Concurrency I/O

To achieve sub-millisecond query execution, an in-memory database must satisfy two conflicting requirements: support hundreds of thousands of concurrent connections, and process commands in a strictly serial order to avoid data corruption without spending CPU on thread management.

Going single-threaded avoids locks, but raises a hard question: **how do we stop one slow connection from blocking the entire database?** If a client connects and sends nothing, a naive single-threaded server blocks on `read()`, freezing the whole application.

## A Simple Mental Model: The Single Fast-Food Cashier

```text
       MULTI-THREADED (Lock Contention)             REDIS SINGLE-THREADED (Epoll)
==============================================   ==================================
   [Client 1] --> [ Cashier Thread 1 ] --+          [Client 1] -+
                                         +->[Safe]  [Client 2] -+-> [ Epoll Waiting ] --> [ Single Cashier ]
   [Client 2] --> [ Cashier Thread 2 ] --+->[Lock]  [Client 3] -+     (Queue Room)        (Continuous Work)
                                         |
   [Client 3] --> [ Cashier Thread 3 ] --+
      (Cashiers fight over single drawer)          (One cashier sweeps queue rapidly)
```

Instead of hiring ten slow cashiers who fight over a single cash drawer (locks), Redis hires **one super-fast cashier** (the single thread). Behind the cashier is a queue manager — the **epoll event loop**. The cashier never waits on a customer to find their wallet; if a customer isn't ready, the queue manager moves them to a waiting area and instantly feeds the cashier the next ready customer.

## Under the Hood: In-Memory Execution and Single-Threading

Redis's bottleneck is almost never the CPU. Because Redis is an **in-memory** database, queries access RAM, which operates in nanoseconds versus milliseconds for SSDs. Since memory access is fast, a single CPU core can process millions of requests per second. The real bottlenecks are:

1. **Network I/O** — time reading packets off sockets and sending responses.
2. **Memory bandwidth** — the physical limit of the RAM bus.

Single-threaded execution buys Redis:

* **Zero lock overhead** — no mutexes, read-write locks, or semaphores; code is linear and free of race conditions.
* **Extreme cache locality** — data structures stay resident in L1/L2 CPU caches because one thread executes sequentially on one core, with no scheduler interruptions clearing registers or cache lines.

## The Solution: Non-Blocking I/O Multiplexing with Epoll

To support thousands of clients without blocking, Redis delegates network monitoring to the kernel via **I/O multiplexing** using the Linux **epoll** API (or `kqueue` on BSD/macOS).

### The Epoll System Calls

`epoll` splits network monitoring into three kernel system calls:

1. **`epoll_create1(0)`** — creates an epoll instance in the kernel, returning a file descriptor for it.
2. **`epoll_ctl(epfd, EPOLL_CTL_ADD, client_socket_fd, &event)`** — registers a client socket with the epoll instance for specific events (e.g. `EPOLLIN` — data ready to read).
3. **`epoll_wait(epfd, &events, maxevents, timeout)`** — blocks the Redis thread *only* until one or more registered sockets have data ready; if nothing is ready, it sleeps for a microsecond-scale timeout.

```text
 Redis Thread                      Linux Kernel                       Client Sockets
==============                    ==============                     ================
  epoll_create1()  -------------> [ Create Epoll Instance ]
  epoll_ctl(ADD)   -------------> [ Register Sockets 3,4,5 ] <------- [ Clients Connect ]

  epoll_wait()     -------------> [ Check for Ready Sockets ]
                                  [ Socket 4 has incoming bytes ]
  (Returns Socket 4) <-----------

  Read & Execute Query
  on Socket 4 (Non-Blocking)
```

### The `ae.c` Event Loop

Redis implements its event loop in `ae.c`. The pseudo-code is elegantly simple:

```c
void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;
    while (!eventLoop->stop) {
        // 1. Blocks until sockets are readable/writable, or a timer fires
        int numevents = aeApiPoll(eventLoop, tvp);

        // 2. Loop through all active, readable sockets
        for (int i = 0; i < numevents; i++) {
            aeFileEvent *fe = &eventLoop->events[eventLoop->fired[i].fd];

            if (fe->mask & AE_READABLE) {
                // Call the read handler (reads socket into Redis buffer)
                fe->readHandler(eventLoop, fe->fd, fe->clientData, mask);
            }
            if (fe->mask & AE_WRITABLE) {
                // Call the write handler (flushes response buffer to client)
                fe->writeHandler(eventLoop, fe->fd, fe->clientData, mask);
            }
        }

        // 3. Process background timer events (e.g., key expiration, active rehashing)
        processTimeEvents(eventLoop);
    }
}
```

## Hands-On Benchmarking: Measuring Event Loop Performance

Use the built-in `redis-benchmark` utility to measure raw event-loop throughput.

### 1. Ping-pong requests with 10,000 parallel clients

```bash
redis-benchmark -c 10000 -n 100000 -t set,get -q
```

Expected output:

```text
SET: 125432.12 requests per second
GET: 148201.09 requests per second
```

### 2. Pipelining to maximize throughput

By default, each client sends a command, waits for the response, then sends the next — bound by network round-trip time (RTT). With **pipelining**, a client sends 16 commands in a single TCP packet, letting the event loop process all 16 in one `epoll` cycle, bypassing per-command network latency:

```bash
redis-benchmark -c 100 -n 1000000 -P 16 -t get -q
```

Expected output:

```text
GET: 1054322.25 requests per second (Over 1 Million ops/sec!)
```

## Common Misconceptions

### "Redis is entirely single-threaded and cannot utilize multi-core CPUs"

While the core query-execution engine and event loop run on a single main thread, Redis uses background helper threads for specific tasks:

* `bio_close_file` — asynchronously closing file descriptors in the background.
* `bio_aof_fsync` — asynchronously flushing the Append-Only File to disk.
* `bio_lazy_free` — asynchronously freeing huge chunks of memory (e.g. deleting a key with 10 million elements) so the main event loop doesn't block.
* Redis 6.0+ introduced multi-threaded I/O to parse incoming queries and format outgoing packets in parallel, while actual command execution remains strictly single-threaded.

### "Since Redis is so fast, I can run complex O(N) operations anytime"

Because Redis is single-threaded, a single slow O(N) command (`KEYS *`, or `SMEMBERS` on a set with millions of entries) blocks the entire event loop. Every other client waiting on `epoll_wait` experiences timeouts. Never run blocking commands in production — use `SCAN` instead.

## Pause and Think

**Critical question:** If Redis runs on a 64-core server, and the application is bottlenecked on the single Redis main thread, how do you scale to use the remaining 63 cores?

**Answer:** Since Redis is a lightweight, single-process engine by design, the idiomatic way to scale on one machine is to run **multiple independent Redis instances** on different ports (e.g. 6379, 6380, 6381), then shard the keyspace across them using **Redis Cluster** or client-side partitioning — utilizing 100% of the multi-core hardware.

## Key Takeaways

* Redis uses a single-threaded execution model to eliminate context-switching and lock overhead entirely.
* The database runs in-memory, executing operations in nanoseconds.
* Network monitoring is offloaded to the OS kernel via the non-blocking `epoll` API.
* A single thread can sustain over a million operations per second when round-trips are batched via pipelining.
* Avoid O(N) commands in production; they block the event loop for every other client.

## What to Learn Next

* Redis Cluster hash slots and the gossip protocol for distributed routing.
* The difference between RDB snapshotting and AOF persistence disk synchronization.
* Tuning TCP backlog and keepalive parameters in `redis.conf` for massive socket volumes.
