---
title: "Raft vs Paxos: Distributed Consensus in Practice"
description: "Why distributed systems need a consensus protocol, how Raft's leader-election and log-replication model achieves the same guarantees as Paxos while staying understandable, and a working Go implementation of the quorum-commit path."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "consensus"
  - "raft"
  - "paxos"
  - "distributed-systems"
  - "leader-election"
  - "quorum"
---

# Raft vs Paxos: Distributed Consensus in Practice

## The Problem: Agreeing on One Truth Across Unreliable Machines

Suppose you are building a distributed key-value store like etcd, and you replicate every write across five nodes so the cluster survives hardware failure. A client sends `SET x = 5` to Node 1 while, a few milliseconds later, another client sends `SET x = 7` to Node 3. The network between nodes is unreliable — packets get delayed, reordered, or dropped, and any node can crash at any time.

If Node 1 and Node 3 each apply their write locally and call it done, the cluster now disagrees about what `x` is. Every node must apply mutations in the *same order*, even though they cannot trust a single shared clock and cannot assume messages arrive reliably. This is the **distributed consensus problem**: getting a set of unreliable nodes, communicating over an unreliable network, to agree on a single sequence of values.

## The Mental Model

Picture a five-person board of directors, each in a separate room, communicating only by passing notes under the door. Notes can get lost. A director can fall asleep (crash) and wake up later. If **three of the five** (a majority, or *quorum*) agree on a decision, it becomes official — even though the other two never saw it, and even if one of them wakes up later still believing the old plan.

That quorum requirement — `N/2 + 1` — is the core arithmetic behind every consensus protocol discussed below. In a 5-node cluster, quorum is 3: two nodes can vanish entirely and the system keeps making progress.

## Paxos: Mathematically Sound, Practically Opaque

Leslie Lamport published Paxos in 1998 as a provably correct solution to single-value consensus. Any node can propose a value; a two-phase protocol (Prepare/Promise, then Accept/Accepted) ensures that once a majority accepts a value, it can never be overturned.

Paxos is correct, but the original paper described it as an allegory about a fictional Greek parliament, and translating that allegory into production code produces subtle correctness bugs that took the industry over a decade to feel comfortable with. Google's Chubby lock service team wrote a well-known retrospective describing exactly this difficulty — Paxos is easy to state and hard to implement.

## Raft: The Same Guarantees, Designed to Be Understood

In 2013, Diego Ongaro and John Ousterhout published Raft specifically to solve the *understandability* problem, while providing the same safety guarantees as (multi-instance) Paxos. Raft decomposes consensus into three separable sub-problems:

1. **Leader election** — exactly one node is the authority at a time.
2. **Log replication** — the leader is the only node that accepts writes and pushes them to followers.
3. **Safety** — a follower can never win an election with a less up-to-date log than the majority.

### 1. Leader Election

- Every node starts as a **Follower**.
- If a Follower doesn't hear a heartbeat from a Leader within a randomized election timeout (commonly 150–300ms), it becomes a **Candidate**, increments its term number, and requests votes from every other node.
- The first Candidate to receive votes from a majority becomes the **Leader** for that term.
- The timeout is *randomized per node* specifically so that two nodes rarely time out in the same millisecond and split the vote — a small piece of engineering that makes elections converge quickly in practice.

### 2. Log Replication

All writes flow through the Leader:

```text
   Client              Leader                Follower 1           Follower 2
     │                    │                       │                     │
     │── Write X=5 ──────▶│                       │                     │
     │                    │── AppendEntry(X=5) ──▶│                     │
     │                    │── AppendEntry(X=5) ─────────────────────────▶│
     │                    │                       │                     │
     │                    │◀── Ack ───────────────│                     │
     │                    │      (quorum: 2 of 3 reached, commit X=5)   │
     │◀── Success ────────│                       │                     │
     │                    │── Commit X=5 ────────▶│                     │
     │                    │── Commit X=5 ────────────────────────────────▶│
```

1. Client asks to write `x = 5`.
2. Leader appends the entry to its own log as *uncommitted*.
3. Leader replicates the entry to all Followers.
4. Once a **majority** of Followers acknowledge the write, the Leader commits the entry and applies it to its state machine.
5. Leader responds "success" to the client, and tells Followers to commit the entry too.

Note that only a majority ack is required — a slow or partitioned minority never blocks progress.

### 3. Safety

Raft's safety guarantee rests on one rule: a Candidate cannot win an election unless its log is at least as up-to-date as a majority of the cluster's logs (compared by last log term, then index). This prevents a node that missed recent commits from becoming Leader and silently overwriting already-committed data — the single most important correctness property either protocol has to preserve.

## Minimal Raft-Style Log Replication in Go

The snippet below implements the quorum-commit mechanics of Raft's log-replication phase — a `Leader` type that appends entries locally, fans them out to followers over channels (standing in for RPCs), and only marks an entry committed once a majority of acknowledgements arrive.

```go
package raft

import "sync"

// LogEntry is a single command replicated across the cluster.
type LogEntry struct {
	Term    int
	Index   int
	Command string
}

// Follower represents a remote node's replication endpoint.
type Follower struct {
	ID      string
	Inbox   chan LogEntry
	AckChan chan int // acks back the committed index
}

// Leader owns the authoritative log and drives replication.
type Leader struct {
	mu        sync.Mutex
	term      int
	log       []LogEntry
	followers []*Follower
}

func NewLeader(term int, followers []*Follower) *Leader {
	return &Leader{term: term, followers: followers}
}

// Propose appends a new command and blocks until a quorum commits it.
func (l *Leader) Propose(command string) LogEntry {
	l.mu.Lock()
	entry := LogEntry{Term: l.term, Index: len(l.log), Command: command}
	l.log = append(l.log, entry)
	l.mu.Unlock()

	acks := make(chan struct{}, len(l.followers))
	for _, f := range l.followers {
		go func(f *Follower) {
			f.Inbox <- entry
			ackedIndex := <-f.AckChan
			if ackedIndex >= entry.Index {
				acks <- struct{}{}
			}
		}(f)
	}

	// Quorum = majority of the FULL cluster, leader included.
	quorum := (len(l.followers)+1)/2 + 1
	acked := 1 // leader counts as one vote for its own entry
	for acked < quorum {
		<-acks
		acked++
	}
	return entry // safe to report "committed" to the client
}
```

```go
// Follower-side loop: append whatever the leader sends, then ack the index.
func RunFollower(f *Follower, applyLog *[]LogEntry) {
	for entry := range f.Inbox {
		*applyLog = append(*applyLog, entry)
		f.AckChan <- entry.Index
	}
}
```

The key line is `quorum := (len(l.followers)+1)/2 + 1` — this is the `N/2 + 1` majority rule made concrete. `Propose` returns as soon as that many acknowledgements arrive, regardless of whether the remaining followers are slow, partitioned, or dead.

## Architectural Takeaway

Any system that coordinates cluster metadata or needs a single source of truth under node failures — etcd, Consul, ZooKeeper (a Paxos-family variant called Zab), Kafka's KRaft controller, Kubernetes' control plane — has a consensus algorithm at its core. **Raft has become the default choice for new systems** precisely because its decomposition into leader election, log replication, and safety makes it something a team can actually implement correctly and reason about during an incident. Paxos remains foundational and is still deeply embedded in systems like Google Spanner and Chubby, but almost nobody starts a new distributed system with raw single-decree Paxos today — they either use Raft or a Multi-Paxos variant with an explicit stable-leader optimization.
