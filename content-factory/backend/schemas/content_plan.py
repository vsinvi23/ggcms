from pydantic import BaseModel

class ContentPlan(BaseModel):
    content_type: str
    title: str
    audience: str
    objectives: list[str] = []
    sections: list[dict] = []
    examples: list[dict] = []
    exercises: list[dict] = []
    citations_required: bool = True

