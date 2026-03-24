import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

# 导入新加的 auth 服务
from services.auth_service import router as auth_router, verify_token
from services.announcement_service import router as announcement_router
from services.contest_service import router as contest_router
from services.download_service import router as download_router
from services.judge_service import router as judge_router
from services.rule_service import router as rule_router
from services.verifyCertificate import router as verify_certificate_router
app = FastAPI(title="AutoJudge API", version="2.0.0")

# 允许跨域
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# ================= 1. 公开接口 =================
# 登录接口放行
app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])


# ================= 2. 受保护接口 =================
# 管理平台路由（全部需要登录）
app.include_router(
    contest_router,
    prefix="/api/admin",
    dependencies=[Depends(verify_token)]
)
app.include_router(
    announcement_router,
    prefix="/api/admin",
    dependencies=[Depends(verify_token)]
)
app.include_router(
    rule_router,
    prefix="/api/admin",
    dependencies=[Depends(verify_token)]
)

# 判分与下载路由（全部需要登录）
app.include_router(
    judge_router,
    prefix="/api",
    dependencies=[Depends(verify_token)]
)
app.include_router(
    download_router,
    prefix="/api",
    dependencies=[Depends(verify_token)]
)
app.include_router(
    verify_certificate_router,
    prefix="/api",
    # dependencies=[Depends(verify_token)]
)
if __name__ == "__main__":
    # 修改 port=8080
    uvicorn.run(app, host="localhost", port=8080)