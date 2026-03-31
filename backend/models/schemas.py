import uuid
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class Track(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""

class Contest(BaseModel):
    id: Optional[str] = None
    category: str = "通用比赛"
    name: str
    description: Optional[str] = ""
    logo_url: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = "进行中"
    tracks: List[Track] = []

class JudgeRequest(BaseModel):
    filename: str
    original_filename: Optional[str] = None
    contest_id: str
    track_id: Optional[str] = None

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

class FileItem(BaseModel):
    filename: str
    original_filename: str

class BatchJudgeRequest(BaseModel):
    files: List[FileItem]
    contest_id: str
    track_id: Optional[str] = None

class ZipBatchJudgeRequest(BaseModel):
    zip_filename: str
    contest_id: str
    track_id: Optional[str] = None
