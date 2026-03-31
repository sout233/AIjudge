from datetime import datetime, timedelta, UTC

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.config.config import ACCESS_TOKEN_EXPIRE_DAYS, SECRET_KEY, ALGORITHM

security = HTTPBearer()


async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """JWT 校验函数，供其他接口作为 Depends 使用"""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        return payload
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="无效的 Token 或登录已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_name(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """从 JWT 中提取用户 name 字段"""
    payload = await verify_token(credentials)
    user_name = payload.get("name")
    if not user_name:
        raise HTTPException(
            status_code=401,
            detail="Token 中缺少用户 name 信息",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_name

def create_access_token(data: dict) -> str:
    """生成 JWT Token"""
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """解码 JWT Token，失败时抛出 JWTError"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])