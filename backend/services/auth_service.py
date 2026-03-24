from fastapi import APIRouter, HTTPException, Header, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import httpx
from jose import jwt, JWTError
from datetime import datetime, timedelta
from config import DIFY_BASE_URL
import base64

router = APIRouter()

# 去除DIFY_BASE_URL中的"/v1"后缀
DIFY_INTERNAL_URL = DIFY_BASE_URL.rstrip('/v1')

SECRET_KEY = "your-secret-key-666"
ALGORITHM = "HS256"


class LoginSchema(BaseModel):
    email: str
    password: str

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    JWT 校验函数，供其他接口作为 Depends 使用
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # 如果需要，这里可以从 payload 提取 email 或 role 并返回
        return payload
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="无效的 Token 或登录已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/login")
async def login(data: LoginSchema):
    # 使用同一个 client 以便自动维持 Session (Cookie)
    async with httpx.AsyncClient(base_url=DIFY_INTERNAL_URL, follow_redirects=True) as client:
        try:
            # 1. 执行登录
            login_resp = await client.post(f"{DIFY_INTERNAL_URL}/console/api/login", json={
                "email": data.email,
                "password": base64.b64encode(data.password.encode('utf-8')).decode('utf-8')
            })

            if login_resp.status_code != 200 or login_resp.json().get("result") != "success":
                raise HTTPException(status_code=401, detail="Dify 认证失败")

            # 2. 准备 CSRF Headers (Dify 的 POST 接口通常校验此项)
            # 从 Cookie 中提取 csrf_token
            csrf_token = client.cookies.get("csrf_token")
            headers = {"X-CSRF-Token": csrf_token} if csrf_token else {}

            # 3. 并发或顺序获取 Workspace 和 Profile 信息
            ws_resp = await client.post(f"{DIFY_INTERNAL_URL}/console/api/workspaces/current", headers=headers)
            # 获取个人资料 (为了拿到真正的账号名称 name)
            profile_resp = await client.get(f"{DIFY_INTERNAL_URL}/console/api/account/profile",headers=headers)

            if ws_resp.status_code != 200 or profile_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="无法同步 Dify 用户状态")

            ws_data = ws_resp.json()
            profile_data = profile_resp.json()

            # 4. 提取你需要的字段
            # 注意：JWT 负载里存的是 profile 里的个人名字和 workspace 里的角色
            user_info = {
                "id": profile_data.get("id"),
                "name": profile_data.get("name"),  # "Future_Enter"
                "email": profile_data.get("email"),
                "role": ws_data.get("role"),  # "owner"
                "workspace_id": ws_data.get("id")
            }


        except Exception as e:

            # 打印详细堆栈以便调试

            import traceback

            print(f"=== 登录流程出错 ===")

            print(f"错误类型: {type(e).__name__}")

            print(f"错误详情: {str(e)}")

            print(f"堆栈追踪:\n{traceback.format_exc()}")

            # 区分是网络错误还是逻辑错误

            if "status_code" in str(e):

                raise e  # 如果是上面抛出的 HTTPException，直接向上抛

            else:

                raise HTTPException(status_code=500, detail=f"内部通信异常: {str(e)}")

    # 5. 签发包含 name 和 role 的 JWT
    token_data = {
        "sub": user_info["email"],
        "uid": user_info["id"],
        "name": user_info["name"],  # 存入 "Future_Enter"
        "role": user_info["role"],  # 存入 "owner"
        "exp": datetime.utcnow() + timedelta(days=7)
    }

    token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_info
    }


# services/auth_service.py (在文件末尾添加)

async def get_current_user_name(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    专门用于提取 JWT 中的用户 name 字段
    可直接在 router 中作为 Depends 使用
    """
    # 复用现有的 verify_token 逻辑进行校验
    payload = await verify_token(credentials)

    # 从 payload 中提取 name
    # 根据 login 函数生成的 token 结构，name 直接在根层级
    user_name = payload.get("name")

    if not user_name:
        raise HTTPException(
            status_code=401,
            detail="Token 中缺少用户 name 信息",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_name