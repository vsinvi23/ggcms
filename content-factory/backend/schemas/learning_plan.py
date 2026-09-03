from pydantic import BaseModel

class LearningPlan(BaseModel):
    learner_profile: str
    problem_statement: str
    objectives: list[str]
    prerequisites: list[str] = []
    difficulty: str  # beginner | intermediate | advanced
    sequence: list[str] = []

