---
title: "Testing AI Agents Like Software: Evaluators, Judges, and Deterministic Mocks"
description: "Why exact-match assertions break on probabilistic agent output, and how to build a test harness combining deterministic tool mocks with LLM-as-a-Judge semantic scoring for CI/CD."
categorySlug: "ai-software-engineering"
articleType: "GUIDE"
tags:
  - "testing-ai-agents"
  - "llm-as-a-judge"
  - "ai-agents"
  - "test-mocking"
  - "evaluation"
---

# Testing AI Agents Like Software: Evaluators, Judges, and Deterministic Mocks

## The Indeterminacy of Cognitive Testing

In classical software engineering, testing is deterministic. Given an input $X$, a function executes a fixed sequence of operations and returns an output $Y$. Developers assert correctness using simple, binary statements like `assert response.status_code == 200` or `assert parsed_json["total"] == 150`.

AI agents break this testing paradigm. Because agents use probabilistic language models to generate reasoning paths, write code, and select tools, their outputs are highly variable. Asserting an exact string match on an agent's summary or expecting an identical tool-calling sequence across test runs is a recipe for brittle, failing CI/CD pipelines.

To ship agentic systems with confidence, engineers must adapt software testing principles: replacing exact-match assertions with **deterministic tool mocks** to isolate behavior, and employing **LLM-as-a-Judge** scoring rubrics to evaluate semantic accuracy.

## Architectural Blueprint: The Agent Evaluation Pipeline

The diagram below maps an automated agent test runner that integrates mocked system responses with an LLM-based evaluation pipeline.

```text
+-----------------+         +-----------------+         +-----------------+
|   Test Runner   | ------> |   Mock Tool     | ------> |   AI Agent      |
|    (Pytest)     |         |  (Deterministic)|         |   Under Test    |
+-----------------+         +-----------------+         +-----------------+
         ^                                                       |
         |                                                       | 1. Run Complete
         |                                                       v
         |                  +-----------------+         +-----------------+
         | 3. Score >= 0.8  |  LLM-as-a-Judge | <------ |  Agent Output   |
         +----------------- | (Eval Rubric)   |         |  & Trajectory   |
                            +-----------------+         +-----------------+
```

## Technical Implementation: Agent Test Suite

The following Python code implements a self-contained testing harness. It mocks external database APIs to make the environment deterministic and uses a structured LLM-as-a-Judge evaluator to score the agent's semantic correctness.

```python
import json
import unittest
from unittest.mock import MagicMock
from typing import Dict, Any, Tuple
from pydantic import BaseModel, Field

# 1. Structured Output Schema for our LLM Judge
class EvaluationReport(BaseModel):
    correctness_score: float = Field(..., description="Semantic correctness score between 0.0 and 1.0.")
    reasoning: str = Field(..., description="Detailed architectural reason for the assigned score.")

# 2. Mocking the Agent's External Environment
class MockDatabaseTool:
    def __init__(self):
        self.query_records = MagicMock(return_value={
            "status": "success",
            "records": [{"id": "UID-99", "tier": "Enterprise", "balance": 45000}]
        })

# 3. The Agent Under Test
class CustomerSupportAgent:
    def __init__(self, db_tool: MockDatabaseTool):
        self.db_tool = db_tool

    def process_request(self, user_query: str) -> str:
        # Agent queries the mocked database to fetch data
        records_payload = self.db_tool.query_records("UID-99")

        # Simulates agent reasoning and text generation
        account_tier = records_payload["records"][0]["tier"]
        balance = records_payload["records"][0]["balance"]

        return f"Customer UID-99 is on the {account_tier} tier with a balance of ${balance}. They qualify for priority migration."

# 4. LLM-as-a-Judge Evaluator Engine
class LLMAsAJudge:
    def evaluate_output(self, student_output: str, golden_truth: str) -> EvaluationReport:
        """Simulates an LLM evaluating the student agent output against the ground truth."""
        # In a real environment, this dispatches a structured JSON request to a frontier model
        # evaluating adherence, tone, and specific factual correctness against a static rubric.
        is_correct = "UID-99" in student_output and "Enterprise" in student_output and "45000" in student_output

        if is_correct:
            return EvaluationReport(
                correctness_score=1.0,
                reasoning="The agent output contains all factual keys: customer ID, tier level, and account balance."
            )
        else:
            return EvaluationReport(
                correctness_score=0.0,
                reasoning="The agent output is missing critical records from the database."
            )

# 5. Automated CI/CD Assertion
class TestAgentSystem(unittest.TestCase):
    def test_customer_qualification_workflow(self):
        # Setup deterministic environment
        mock_db = MockDatabaseTool()
        agent = CustomerSupportAgent(db_tool=mock_db)
        evaluator = LLMAsAJudge()

        # Execute agent workflow
        actual_output = agent.process_request("Analyze customer quality status.")

        # Assert tool calling was triggered correctly (Behavioral assertion)
        mock_db.query_records.assert_called_once_with("UID-99")

        # Evaluate cognitive correctness using LLM Judge (Semantic assertion)
        golden_truth = "UID-99 is an Enterprise customer with a $45,000 balance."
        eval_report = evaluator.evaluate_output(actual_output, golden_truth)

        print(f"[TEST EVAL] Score: {eval_report.correctness_score}. Reason: {eval_report.reasoning}")
        self.assertGreaterEqual(eval_report.correctness_score, 0.8, f"LLM-as-a-Judge failed: {eval_report.reasoning}")

if __name__ == "__main__":
    unittest.main()
```

Notice the test asserts two independent things, and both matter: `mock_db.query_records.assert_called_once_with("UID-99")` is a **behavioral assertion** — it proves the agent called the right tool with the right argument, deterministically, regardless of what the LLM ultimately says. The judge's `correctness_score` is a **semantic assertion** — it proves the natural-language output actually communicates the retrieved facts. A test that only checked one of these could pass while the other silently regressed: an agent could call the wrong tool but still phrase a plausible-sounding (wrong) answer, or call the right tool and then garble the response.

## Production Evaluation Frameworks

### Golden Evaluation Datasets

To prevent regression during prompt updates or model migrations, maintain a "Golden Dataset" of 100+ vetted input-output pairs. Run this suite asynchronously during staging builds. Measure overall system performance using metrics like pass/fail ratios, average cost per run, and semantic similarity scores.

### Validation of the Judge

An LLM Judge itself can drift. Periodically compute human-to-AI agreement scores (e.g., Cohen's Kappa coefficient) by having human QA leads grade a subset of agent runs. If the model's correlation falls below 0.8, refine the evaluation rubric with explicit edge-case instructions or upgrade the judge model to a higher-capacity reasoning tier.

### Why Self-Written Tests Are Not Independent Evidence

A subtle trap specific to agentic development: if the same agent that implements a feature is also asked to write its own tests in the same session, a wrong implementation and a test asserting against that same wrong implementation can both look green. The mocked-tool-plus-judge pattern above only protects you if the golden truth (`"UID-99 is an Enterprise customer with a $45,000 balance."`) and the mock's fixture data were defined independently of the agent under test — ideally by a human, or by a separate agent that never sees the implementation.

## Key Takeaways

1. **Split assertions into behavioral and semantic layers.** Deterministic mocks verify *which* tools were called with *what* arguments; an LLM judge verifies whether the *natural-language* output is actually correct.
2. **Golden datasets are regression tests for prompts, not just for code.** A prompt or model migration can silently degrade quality in ways only a held-out evaluation set will catch.
3. **The judge itself needs to be tested.** Track human-to-AI agreement over time; a drifting judge gives you false confidence exactly when you need the signal most.
