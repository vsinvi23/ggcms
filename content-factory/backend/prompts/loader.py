from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent


def load_prompt(name: str) -> str:
    """
    Loads a prompt template from backend/prompts/<name>.md as raw text.

    `name` is the template's base filename without extension, e.g. "research"
    for backend/prompts/research.md. The prompts directory is resolved
    relative to this file (not the CWD), so this works regardless of where
    the process is launched from.

    Dynamic values are substituted by the caller via str.format(...) using
    the named placeholders documented in each template.
    """
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Prompt template not found: {path}")
    return path.read_text(encoding="utf-8")
