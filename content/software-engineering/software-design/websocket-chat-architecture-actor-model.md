---
title: "Real-Time Chat Architecture: WebSockets and the Actor Model at Billion-User Scale"
description: "Why HTTP polling collapses under real-time messaging load, and how a persistent WebSocket gateway combined with lightweight actor-based connection isolation (the Erlang/Elixir model behind WhatsApp) scales to millions of concurrent connections per server."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "websockets"
  - "actor-model"
  - "real-time-messaging"
  - "erlang"
  - "xmpp"
---

# Real-Time Chat Architecture: WebSockets and the Actor Model at Billion-User Scale

## The Problem: The Stateless HTTP Fallacy at Billion-User Scale

The naive way to build a "real-time" chat feature is to keep using standard stateless HTTP: have each client poll a REST endpoint every few seconds to check for new messages.

```
+------------+               +---------------+               +------------+
|  Client A  | -- HTTP GET ->|  Web Server   | -- DB Query ->|  Database  |
|            | <- HTTP 200 --| (No New Msg)  |               |            |
+------------+               +---------------+               +------------+
```

This pattern breaks down along three independent axes once you scale past a small user base:

1. **Network overhead.** A single HTTP/1.1 or HTTP/2 request carries meaningful header overhead — often 500 bytes to 2KB — on top of whatever payload it's checking for. Multiplied by billions of polls per minute across a user base, that's gigabytes of pure protocol overhead, most of which returns "no new message."
2. **Database exhaustion.** Every poll that finds nothing new is still a query. At scale, the overwhelming majority of your database read load becomes no-op polling rather than useful work.
3. **Structural latency.** If a client polls every 5 seconds, a message sent the instant after a poll completes waits up to 5 seconds before the recipient's next poll picks it up — the polling interval becomes a hard floor on message latency.

Even upgrading to long-polling or Server-Sent Events doesn't fix the underlying resource problem: conventional multi-threaded web servers (Apache, JVM/Tomcat) allocate a heavyweight OS thread — typically 1-2 MB of stack — per open connection. Holding 10 million idle connections open on such a server would require 10-20 **terabytes** of RAM for thread stacks alone, before a single message is processed.

## The Mental Model: Persistent Switchboard, Actor-Based Isolation

Scaling real-time messaging to billions of users requires shifting from **pull-based, stateless transactions** to a **push-based, persistent switchboard**. Instead of clients repeatedly knocking on the door, each client opens a single long-lived, bidirectional connection to a lightweight gateway process. That gateway holds the connection open at minimal memory cost, and pushes messages down it the instant they arrive — no polling interval, no wasted round trips.

```
+------------+             +--------------------+             +------------+
|  Client A  | -- Msg ---> | Connection Manager | -- Broker ->|  Client B  |
| (WebSocket)|             |   (Actor for A)    |             |(WebSocket) |
+------------+             +--------------------+             +------------+
```

This model rests on two pillars: a low-overhead transport (WebSockets) carrying a structured application protocol (XMPP or a custom binary equivalent), and a connection-management runtime that can hold millions of open sockets cheaply (the actor model).

### 1. WebSockets vs. XMPP

WebSockets provide the low-overhead, full-duplex transport: a single TCP connection, upgraded once from HTTP, over which either side can push frames at any time — no repeated handshake, no per-message header bloat. **XMPP** (eXtensible Messaging and Presence Protocol) is the application-layer protocol historically layered on top: it defines messages, presence (online/offline/typing), and contact rosters as structured XML stanzas. Because raw XML is verbose, production systems (WhatsApp among them) replace XMPP's XML encoding with a compact binary format or protocol buffers, keeping the semantic structure but stripping the tag-name overhead from every frame.

### 2. The Actor Model for Cheap Concurrency

Erlang and Elixir run on the BEAM virtual machine, which implements the **actor model**: instead of one OS thread per connection, BEAM schedules millions of lightweight, user-space processes ("actors") that each consume roughly 2.6 KB of memory. Actors share no memory and communicate purely through asynchronous message passing, so there's no lock contention between them. A single 64 GB server can hold over 2 million actor-backed WebSocket connections — several orders of magnitude more than a thread-per-connection model on the same hardware.

The actor model is a general connection-scaling pattern, not Erlang-specific: Go's goroutines, Akka on the JVM, or Rust's Tokio tasks can all achieve a similar cheap-per-connection-unit outcome, though none match BEAM's per-actor isolation guarantees exactly.

## The Architecture: End-to-End Message Flow

Here is how a message travels from User A to User B, including the online-delivery path and the offline push-notification fallback.

```
 User A         Connection Actor A       Broker/Router       Connection Actor B        User B          Push Service
   │                    │                     │                     │                    │                  │
   │  send(msg, to=B)   │                     │                     │                    │                  │
   │───────────────────>│                     │                     │                    │                  │
   │                    │  route(to=B, msg)   │                     │                    │                  │
   │                    │────────────────────>│                     │                    │                  │
   │                    │                     │                     │                    │                  │
   │                    │           ┌─── is B online? ───┐          │                    │                  │
   │                    │           │                    │          │                    │                  │
   │                    │        YES│                    │NO        │                    │                  │
   │                    │           ▼                    ▼          │                    │                  │
   │                    │  dispatch(msg)          trigger push notif │                    │                  │
   │                    │────────────────────────────────────────────────────────────────────────────────────>│
   │                    │           │                                │                    │  wake / notify   │
   │                    │           ▼                                │                    │<─────────────────│
   │                    │                                             deliver via socket   │                  │
   │                    │                                            ────────────────────>│                  │
   │                    │                                             ACK (delivered)      │  (client later   │
   │                    │                                            <────────────────────│   reconnects &   │
   │                    │      delivery confirmation                                       │   pulls offline  │
   │                    │<────────────────────                                             │   queue)         │
   │  status: delivered │                                                                  │                  │
   │<───────────────────│  (double checkmark)                                              │                  │
```

If User B is online, the broker dispatches directly to B's connection actor, which pushes the message over B's open socket and relays a delivery ACK back through the broker to A. If B is offline, the broker instead triggers a push notification (FCM/APNS) to wake B's device; when B's client reconnects, it pulls any messages queued while it was offline.

## Conceptual Implementation: Elixir Connection Registry and Router

The following illustrates how a connection actor registers itself for routing lookups, and how it handles both locally-routable and remote/offline delivery.

```elixir
defmodule WhatsApp.ConnectionHandler do
  use GenServer
  require Logger

  # Client API — called when a new WebSocket connection is accepted
  def start_link(client_id, socket) do
    GenServer.start_link(__MODULE__, {client_id, socket})
  end

  # Server callbacks
  @impl true
  def init({client_id, socket}) do
    # Register this actor under the user's ID so other actors can look
    # it up by client_id instead of needing a direct process reference.
    Registry.register(WhatsApp.ConnectionRegistry, client_id, self())
    Logger.info("User #{client_id} connected. Actor started: #{inspect(self())}")
    {:ok, %{client_id: client_id, socket: socket}}
  end

  @impl true
  def handle_info({:incoming_message, recipient_id, encrypted_payload}, state) do
    case Registry.lookup(WhatsApp.ConnectionRegistry, recipient_id) do
      [{recipient_pid, _value}] ->
        # Recipient has an actor on this node — hand off directly,
        # no broker round trip needed for a same-node delivery.
        send(recipient_pid, {:deliver_message, state.client_id, encrypted_payload})
        {:noreply, state}

      [] ->
        # Recipient is offline, or connected to a different node in the
        # cluster — hand off to the cluster-wide message broker.
        WhatsApp.MessageBroker.publish(recipient_id, state.client_id, encrypted_payload)
        {:noreply, state}
    end
  end

  @impl true
  def handle_info({:deliver_message, sender_id, encrypted_payload}, state) do
    send_to_socket(state.socket, %{sender_id: sender_id, data: encrypted_payload})
    WhatsApp.Router.confirm_delivery(sender_id, state.client_id)
    {:noreply, state}
  end

  defp send_to_socket(_socket, _payload) do
    # Native port driver call — low-overhead push to the underlying TCP socket.
    :ok
  end
end
```

Each connected user maps to exactly one actor process, so routing a message is a registry lookup plus an asynchronous `send/2` — no locks, no shared mutable connection table to contend over.

## Architectural Guardrails and Trade-offs

1. **Reject polling for real-time features.** Any feature with a sub-second latency requirement should use WebSockets or a bidirectional gRPC stream, not HTTP polling — polling's header overhead and structural latency floor make it unfixable at scale.
2. **Isolate connection state from business logic.** Connection actors should stay thin: accept bytes, route them, push bytes back out. Heavy work — media processing, analytics, spam detection — belongs in downstream consumers off a message queue (Kafka, RabbitMQ), not inline in the connection handler's hot path.
3. **Actor crash isolation is a feature, not an edge case.** Because each connection is an independent, isolated actor, one user's connection crashing (bad payload, client bug) does not affect any other connection on the same node — the supervisor simply restarts that one actor.
4. **Cross-node routing is still required.** A single machine's actor registry only resolves users connected to *that* node. A cluster-wide message broker (or a distributed registry like Erlang's global process groups) is still necessary to route between users connected to different physical servers.

## Key Takeaways

- HTTP polling fails on three independent axes at scale: network overhead, database load, and latency — not just one of them.
- A persistent bidirectional connection (WebSocket) plus a structured messaging protocol (XMPP or a binary equivalent) removes all three.
- The actor model lets a single server hold millions of open connections cheaply by replacing OS threads with ~2.6 KB isolated, message-passing processes.
- Delivery must branch on recipient presence: online users get a direct actor-to-actor push; offline users get a push notification and pull queued messages on reconnect.
