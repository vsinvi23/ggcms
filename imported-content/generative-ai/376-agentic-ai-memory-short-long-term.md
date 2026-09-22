# Agent Memory: Managing Short-Term Sliding Windows and Long-Term Vector Stores

**The Problem:** LLMs are inherently stateless. To create an agent that remembers user preferences across sessions, you must pass the chat history into every API call. However, context windows are finite (and expensive). Pushing a year's worth of conversation history into a prompt will result in a context window crash and massive API bills.

**The Solution:** A dual-memory architecture mimicking human cognition. 
1. **Short-Term Memory (Sliding Window):** Exact transcript of the last *N* messages.
2. **Long-Term Memory (Vector DB):** Semantic retrieval of relevant past facts from months ago, injected dynamically.

### Architecture

```text
[User Input] 
      |
      v
+--------------------------+
| Long-Term Memory (RAG)   | --> Retrieve top-k past relevant facts.
+--------------------------+
      |
      v
+--------------------------+
| Short-Term Memory        | --> Get last 10 messages (Sliding Window).
+--------------------------+
      |
      v
[LLM Context Injection]
System: "Relevant past facts: {LTM_facts}"
History: [Msg 1, Msg 2 ... Msg 10]
Current: {User Input}
```

### Robust Implementation (Python)

This implementation manages both memory streams seamlessly.

```python
import uuid
from typing import List, Dict

class AgentMemory:
    def __init__(self, vector_store, embedder, window_size=5):
        self.vdb = vector_store
        self.embedder = embedder
        self.window_size = window_size
        
        # Redis, Postgres, or In-Memory dict
        self.short_term_store: Dict[str, List[dict]] = {}

    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self.short_term_store:
            self.short_term_store[session_id] = []
            
        msg = {"role": role, "content": content}
        self.short_term_store[session_id].append(msg)
        
        # If it's a user message, we embed it into Long Term Memory
        if role == "user":
            emb = self.embedder.embed(content)
            self.vdb.upsert(
                id=str(uuid.uuid4()),
                vector=emb,
                metadata={"session_id": session_id, "text": content}
            )

    def get_context(self, session_id: str, current_query: str) -> dict:
        # 1. Retrieve Short-Term Memory (Sliding Window)
        history = self.short_term_store.get(session_id, [])
        # Slice the last N messages
        recent_history = history[-self.window_size:] 
        
        # 2. Retrieve Long-Term Memory (Semantic Search)
        query_emb = self.embedder.embed(current_query)
        ltm_results = self.vdb.search(
            query_emb, 
            top_k=3, 
            filter={"session_id": session_id} # Only search this user's past
        )
        ltm_facts = [res.metadata["text"] for res in ltm_results]
        
        return {
            "recent_history": recent_history,
            "past_facts": ltm_facts
        }

# Usage execution
def chat_turn(session_id: str, user_query: str, memory_module: AgentMemory, llm):
    # Retrieve context
    context = memory_module.get_context(session_id, user_query)
    
    # Construct Prompt
    system_prompt = f"Remember these past facts about the user: {context['past_facts']}"
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(context['recent_history'])
    messages.append({"role": "user", "content": user_query})
    
    # Generate response
    response = llm.generate(messages)
    
    # Save to memory
    memory_module.add_message(session_id, "user", user_query)
    memory_module.add_message(session_id, "assistant", response)
    
    return response
```

### Advanced Optimization: Entity Extraction
Saving every raw chat message into the vector database can create noisy long-term memory. A more robust approach uses an LLM in the background to asynchronously summarize and extract persistent facts (e.g., "User prefers Python", "User is allergic to peanuts") and only stores those high-signal facts in the Long-Term Vector DB.
