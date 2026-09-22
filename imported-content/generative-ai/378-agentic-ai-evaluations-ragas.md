# Evaluating RAG/Agents: Automated Metrics using RAGAS and LLM-as-a-Judge

**The Problem:** "Vibes" are not a metric. When you tweak chunk sizes, change embedding models, or update the agent's system prompt, how do you know if the system got better or worse? Human evaluation is too slow, too expensive, and impossible to integrate into a CI/CD pipeline.

**The Solution:** Automated Evaluation via RAGAS (Retrieval Augmented Generation Assessment) and the "LLM-as-a-Judge" pattern. We use a stronger, more capable LLM (like GPT-4) to grade the outputs of our RAG pipeline based on strict rubrics.

### Architecture

```text
[Eval Dataset]
(Question, Ground Truth Answer)
      |
      v
+-----------------------+
|   RAG Pipeline        | -> Outputs: (Generated Answer, Retrieved Contexts)
+-----------------------+
      |
      v
+-----------------------+
|  Evaluation Engine    | (LLM-as-a-Judge using RAGAS Metrics)
+-----------------------+
      |
      v
Metrics: Context Precision, Faithfulness, Answer Relevance
```

### The Core RAGAS Metrics

RAGAS isolates errors into two distinct categories:

1. **Retrieval Metrics (Did the Vector DB do a good job?)**
   - **Context Precision:** Are the provided contexts highly relevant to the question? 
   - **Context Recall:** Did we retrieve *all* the necessary context required to construct the ground truth answer?

2. **Generation Metrics (Did the LLM do a good job?)**
   - **Faithfulness (Hallucination check):** Is the generated answer 100% derivable from the retrieved context? If the LLM brings in outside knowledge, this score drops.
   - **Answer Relevance:** Does the answer directly address the user's question, or does it ramble?

### Robust Implementation (Python)

This snippet demonstrates a custom implementation of a "Faithfulness" evaluator using an LLM as a judge.

```python
import os
import openai
from pydantic import BaseModel, Field

client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))

class FaithfulnessScore(BaseModel):
    reasoning: str = Field(description="Step by step explanation of the score.")
    score: int = Field(description="Score from 0 (hallucinated) to 1 (faithful).")

def evaluate_faithfulness(question: str, context: str, generated_answer: str) -> float:
    eval_prompt = f"""
    You are an impartial judge evaluating a RAG system.
    Your task is to determine if the GENERATED ANSWER is faithful to the CONTEXT.
    If the GENERATED ANSWER contains facts or claims not present in the CONTEXT, score it 0.
    If the GENERATED ANSWER is entirely supported by the CONTEXT, score it 1.
    
    QUESTION: {question}
    CONTEXT: {context}
    GENERATED ANSWER: {generated_answer}
    """
    
    response = client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[{"role": "user", "content": eval_prompt}],
        response_format=FaithfulnessScore,
        temperature=0.0
    )
    
    result = response.choices[0].message.parsed
    print(f"Reasoning: {result.reasoning}")
    return result.score

# Example Execution
q = "What is the capital of France?"
ctx = "France is a country in Europe. Its major cities include Paris, Lyon, and Marseille."
ans_faithful = "The context mentions Paris, but doesn't state it is the capital."
ans_hallucinated = "The capital of France is Paris."

# This will score 1, because the agent correctly deduced the limit of the context.
score1 = evaluate_faithfulness(q, ctx, ans_faithful)

# This will score 0. Even though it is factually correct in the real world, 
# it is a RAG hallucination because it's not supported by the context.
score2 = evaluate_faithfulness(q, ctx, ans_hallucinated)
```

### Implementing in CI/CD
To productionize this, you maintain a "Golden Dataset" of ~100 diverse Q/A pairs. Whenever you alter your codebase, a GitHub Action runs your pipeline against the 100 questions, calculates the mean RAGAS scores, and fails the pull request if the `Faithfulness` score drops below 0.95. This is the only empirical way to tune advanced AI systems.
