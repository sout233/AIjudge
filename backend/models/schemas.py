import uuid

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class Contest(BaseModel):
    id: Optional[str] = None
    category: str = "通用比赛"
    name: str
    description: Optional[str] = ""
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = "进行中"

class JudgeRequest(BaseModel):
    filename: str
    original_filename: Optional[str] = None
    contest_id: str

class JudgeResponse(BaseModel):
    workflow_run_id: str
    filename: str
    result_path: str

class WorkflowStatus(BaseModel):
    status: str
    elapsed_time: float
    messages: List[Dict[str, Any]]
    workflow_data: Dict[str, Any]
    progress: Optional[str] = ""
    error: Optional[str] = None
