from pydantic import BaseModel, Field

class Claim(BaseModel):
    claim: str
    evidence: str
    source: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

class EvidencePack(BaseModel):
    topic: str
    claims: list[Claim] = []
    definitions: list[str] = []
    examples: list[str] = []
    limitations: list[str] = []
    controversies: list[str] = []
    open_questions: list[str] = []
    citations: list[str] = []

