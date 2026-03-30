from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class Track(BaseModel):
    """赛道模型"""
    id: str
    name: str
    description: Optional[str] = ""
    rule_id: Optional[str] = None  # 关联的评分规则ID


class Contest(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    logo: Optional[str] = None  # Base64编码的竞赛logo
    start_time: Optional[str] = None  # 竞赛开始时间 (ISO 8601 格式)
    end_time: Optional[str] = None    # 竞赛结束时间 (ISO 8601 格式)
    is_published: Optional[bool] = False  # 是否上线（发布）
    status: Optional[str] = "进行中"
    tracks: List[Track] = Field(default_factory=list)  # 竞赛包含的多个赛道


class JudgeRequest(BaseModel):
    filename: str
    contest_id: str
    track_id: Optional[str] = None  # 选择的赛道ID


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


class LoginSchema(BaseModel):
    email: str
    password: str


class VerifyInitReq(BaseModel):
    register_no: str
    keyword: str


class Coordinate(BaseModel):
    x: float
    y: float


class VerifySubmitReq(BaseModel):
    session_id: str
    points: list[Coordinate] = []
