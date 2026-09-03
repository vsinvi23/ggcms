from pydantic import BaseModel

class AgentError(BaseModel):
    error_type: str   # e.g. "RESEARCH_INSUFFICIENT"
    agent_name: str   # e.g. "ResearchAgent"
    message: str
    retryable: bool

