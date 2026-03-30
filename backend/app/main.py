import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import verify_token
from app.api.v1.auth import router as auth_router
from app.api.v1.announcements import router as announcement_router
from app.api.v1.contests import router as contest_router
from app.api.v1.downloads import router as download_router
from app.api.v1.judge import router as judge_router
from app.api.v1.rules import router as rule_router
from app.api.v1.verify import router as verify_router
from app.core.config import (
    UPLOAD_DIR,
    RESULT_DIR,
    RULE_DIR,
    CONTEST_DIR,
    ANNOUNCE_DIR,
    REPORT_TEMPLATE_DIR,
    PDF_CACHE_DIR,
)


def create_app() -> FastAPI:
    # 确保必要的目录存在
    for d in [UPLOAD_DIR, RESULT_DIR, RULE_DIR, CONTEST_DIR, ANNOUNCE_DIR, REPORT_TEMPLATE_DIR, PDF_CACHE_DIR]:
        os.makedirs(d, exist_ok=True)

    app = FastAPI(title="AutoJudge API", version="2.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 公开接口
    app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])

    # 受保护接口
    app.include_router(
        contest_router,
        prefix="/api/admin",
        dependencies=[Depends(verify_token)],
    )
    app.include_router(
        announcement_router,
        prefix="/api/admin",
        dependencies=[Depends(verify_token)],
    )
    app.include_router(
        rule_router,
        prefix="/api/admin",
        dependencies=[Depends(verify_token)],
    )
    app.include_router(
        judge_router,
        prefix="/api",
        dependencies=[Depends(verify_token)],
    )
    app.include_router(
        download_router,
        prefix="/api",
        dependencies=[Depends(verify_token)],
    )
    app.include_router(
        verify_router,
        prefix="/api",
    )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8080)
