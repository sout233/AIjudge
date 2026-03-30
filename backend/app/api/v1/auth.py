import base64
import traceback

import httpx
from fastapi import APIRouter, HTTPException

from app.core.config import DIFY_BASE_URL
from app.api.deps import create_access_token
from app.models.schemas import LoginSchema

router = APIRouter()

DIFY_INTERNAL_URL = DIFY_BASE_URL.rstrip("/v1")


@router.post("/login")
async def login(data: LoginSchema):
    async with httpx.AsyncClient(base_url=DIFY_INTERNAL_URL, follow_redirects=True) as client:
        try:
            login_resp = await client.post(
                f"{DIFY_INTERNAL_URL}/console/api/login",
                json={
                    "email": data.email,
                    "password": base64.b64encode(data.password.encode("utf-8")).decode("utf-8"),
                },
            )

            if login_resp.status_code != 200 or login_resp.json().get("result") != "success":
                raise HTTPException(status_code=401, detail="Dify 认证失败")

            csrf_token = client.cookies.get("csrf_token")
            headers = {"X-CSRF-Token": csrf_token} if csrf_token else {}

            ws_resp = await client.post(
                f"{DIFY_INTERNAL_URL}/console/api/workspaces/current", headers=headers
            )
            profile_resp = await client.get(
                f"{DIFY_INTERNAL_URL}/console/api/account/profile", headers=headers
            )

            if ws_resp.status_code != 200 or profile_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="无法同步 Dify 用户状态")

            ws_data = ws_resp.json()
            profile_data = profile_resp.json()

            user_info = {
                "id": profile_data.get("id"),
                "name": profile_data.get("name"),
                "email": profile_data.get("email"),
                "role": ws_data.get("role"),
                "workspace_id": ws_data.get("id"),
            }
        except Exception as e:
            print("=== 登录流程出错 ===")
            print(f"错误类型: {type(e).__name__}")
            print(f"错误详情: {str(e)}")
            print(f"堆栈追踪:\n{traceback.format_exc()}")
            if "status_code" in str(e):
                raise e
            raise HTTPException(status_code=500, detail=f"内部通信异常: {str(e)}")

    token_data = {
        "sub": user_info["email"],
        "uid": user_info["id"],
        "name": user_info["name"],
        "role": user_info["role"],
    }
    token = create_access_token(token_data)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_info,
    }
