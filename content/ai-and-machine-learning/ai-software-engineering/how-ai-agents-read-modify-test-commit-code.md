---
title: "How AI Agents Read, Modify, Test, and Commit Code"
description: "The deterministic read-modify-test-commit pipeline that keeps AI-driven code changes safe: surgical diffing over full-file rewrites, sandboxed test execution, and atomic, rollback-capable Git bindings."
categorySlug: "ai-software-engineering"
articleType: "GUIDE"
tags:
  - "ai-coding-agents"
  - "git-automation"
  - "sandboxing"
  - "diffing-algorithms"
  - "ci-pipeline"
---

# How AI Agents Read, Modify, Test, and Commit Code

When an AI agent modifies a codebase, it operates without human intuition. A naive file rewrite can corrupt source files, break critical dependencies, or pollute Git history with failing compilation states. Safely automating code modifications requires a deterministic execution pipeline: structural file diffing, isolated sandbox validation, and atomic version control integration.

## The Problem: The Risk of Untrusted File Writes

Autoregressive models do not possess an inherent understanding of file boundaries or compilation states. If an agent is allowed to overwrite files directly, several failure modes emerge:

1. **Truncation and Content Deletion**: When asked to modify a single function in a 1,000-line file, an LLM often emits only the updated function, inadvertently truncating the remainder of the file.
2. **Untrusted Code Execution**: Running unvalidated code on a host machine exposes developers to security risks, such as malicious code execution disguised as a dependency update.
3. **Polluted Git History**: Committing every iterative, failing build directly to the repository makes regression tracing impossible and pollutes the collaboration history.

## The Solution: The Read-Modify-Test-Commit Pipeline

To guarantee repository integrity, agents use a structured pipeline that isolates changes until they are verified.

```
+-------------+      +------------------+      +-------------------+      +------------------+
| Read & AST  | ---> |   Surgical Diff  | ---> | Sandbox Execution | ---> |   Git Binding    |
| Ingestion   |      | (Myer's/Search)  |      |  (Docker/gRPC)    |      | (Atomic Commit)  |
+-------------+      +--------+---------+      +---------+---------+      +--------+---------+
                              |                          |                         |
                              v (If Diff Fails)          v (If Test Fails)         v (If Conflict)
                       [Refine Prompt]            [Feed Diagnostics]        [Rollback/Rebase]
```

## Deep Technical Architecture

### 1. File Diffing Algorithms

Rather than rewriting full files, agents generate patches. Two main diffing strategies are employed:

* **Search-and-Replace Blocks**: The agent outputs exact `Search` blocks matching lines in the original file, paired with `Replace` blocks. The engine uses fuzzy string matching or Levenshtein distance if indentation or whitespace drifts.
* **AST-Based Myer's Diff**: The engine computes the shortest edit script using Myer's diff algorithm. It then validates that modifications do not break the Abstract Syntax Tree (AST) structure of the file before applying them.

### 2. Test Execution Sandbox

Untrusted code must be compiled and tested in an isolated environment. The agent orchestrator spins up a lightweight Docker container or executes inside a secure gRPC sandbox. This sandbox restricts network access, limits file-system mutations, and restricts CPU/memory usage to prevent infinite loops. The orchestrator captures `stdout`, `stderr`, and exit codes to classify failures.

### 3. Atomic Git Bindings

Once tests pass, the engine interacts with Git using a safe wrapper (e.g., `libgit2` or CLI bindings). The engine creates ephemeral feature branches (`agent/patch-123`), staging only the targeted files. If conflicts arise, it attempts programmatic rebasing or reports the conflict back to the orchestrator for resolution.

## Concrete Implementation: The Agent Edit-Test Loop

Below is a robust Python implementation demonstrating a file modifier that applies a patch, runs tests inside a subprocess sandbox, and commits the changes using Git.

```python
import subprocess
import os
import shutil
from typing import Tuple

class AgentSandboxRunner:
    def __init__(self, repo_path: str, test_command: str):
        self.repo_path = repo_path
        self.test_command = test_command

    def apply_patch(self, file_path: str, old_text: str, new_text: str) -> bool:
        full_path = os.path.join(self.repo_path, file_path)
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        if old_text not in content:
            return False

        # Apply surgical replace
        updated_content = content.replace(old_text, new_text, 1)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(updated_content)
        return True

    def run_tests_sandbox(self) -> Tuple[int, str]:
        # Emulate sandboxed test execution
        try:
            result = subprocess.run(
                self.test_command,
                shell=True,
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return -1, "Execution timed out in sandbox."

    def commit_changes(self, file_path: str, commit_msg: str) -> bool:
        try:
            # Stage only the surgical modification
            subprocess.run(["git", "add", file_path], cwd=self.repo_path, check=True)
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=self.repo_path, check=True)
            return True
        except subprocess.CalledProcessError:
            subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=self.repo_path)
            return False

# Example of executing the loop
if __name__ == "__main__":
    runner = AgentSandboxRunner(repo_path=".", test_command="python -m unittest discover")

    # Surgical patch application
    patched = runner.apply_patch(
        "src/utils.py",
        "def add(a, b):\n    return a + b",
        "def add(a, b):\n    return float(a) + float(b)"
    )
    if patched:
        code, logs = runner.run_tests_sandbox()
        if code == 0:
            runner.commit_changes("src/utils.py", "feat: sanitize input types in utils.add")
            print("Successfully updated and committed code.")
        else:
            print(f"Test failure! Rolling back. Logs:\n{logs}")
            subprocess.run(["git", "checkout", "--", "src/utils.py"])
```

Notice the safety ordering enforced by `main`: `apply_patch` never touches Git, `run_tests_sandbox` never commits, and `commit_changes` only runs after a zero exit code from the test command — and the commit itself is wrapped so that a `git commit` failure (a pre-commit hook rejecting the change, for instance) triggers `git reset --hard HEAD` rather than leaving the working tree in a half-committed state. If the tests fail instead, the `else` branch runs `git checkout -- src/utils.py` to discard the unverified patch entirely, so a failing candidate never lingers in the working tree to confuse the next generation attempt.

By constraining the agent to this deterministic pipeline, we ensure that code changes are safe, verified, and cleanly versioned.

## Key Takeaways

- Agents should never rewrite whole files; surgical search-and-replace or AST-validated Myer's diffs prevent the truncation failure mode where an LLM emits only the changed function and silently drops the rest of the file.
- Every candidate patch runs inside an isolated sandbox (Docker or gRPC) with restricted network, filesystem, and CPU/memory access before it is trusted — untested agent output should never execute directly on the host.
- Git commits happen only after tests pass, and a failed test or a failed commit triggers an explicit rollback (`git checkout --` or `git reset --hard HEAD`) rather than leaving a half-applied change in the working tree or polluting history with a broken commit.
