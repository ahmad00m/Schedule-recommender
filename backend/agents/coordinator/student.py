from pydantic import BaseModel
from typing import Optional, List

class StudentDetails(BaseModel):
    year: Optional[str] = None
    current_quarter: Optional[str] = None
    courses_taken: Optional[List[str]] = None
