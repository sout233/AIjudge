# AIjudge

AIjudge 是一个前后端分离的竞赛作品智能评审系统。仓库当前包含：

- `frontend`：基于 Vite + React + TypeScript 的前端界面
- `backend`：基于 FastAPI 的后端服务
- `backend/storage`：运行时生成的上传文件、结果文件、竞赛配置、规则配置等数据目录

项目详细开发说明见 [docs/development.md](/c:/Users/QiChuang/Desktop/AIjudge/docs/development.md)。

## 快速启动

### 1. 启动后端

推荐使用 `uv`：

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

也可以直接运行仓库内脚本：

```powershell
cd backend
./run.ps1
```

默认后端地址：

```text
http://localhost:8000
```

### 2. 启动前端

```powershell
cd frontend
npm install
npm run dev
```

默认前端地址：

```text
http://localhost:5173
```

前端开发服务器已将 `/api` 代理到 `http://localhost:8000`。

## 当前技术栈

- 前端：React 18、TypeScript、Vite、React Router、Zustand、TanStack Query、Tailwind CSS
- 后端：FastAPI、Pydantic、httpx、python-jose
- 文档/结果处理：PyPDF、WeasyPrint
- 图像/验证码相关：OpenCV、Torch、TorchVision
- 外部能力：Dify 工作流

## 开发入口

- 后端入口：[backend/app/main.py](/c:/Users/QiChuang/Desktop/AIjudge/backend/app/main.py)
- 后端配置：[backend/app/config/config.py](/c:/Users/QiChuang/Desktop/AIjudge/backend/app/config/config.py)
- 前端路由入口：[frontend/src/App.tsx](/c:/Users/QiChuang/Desktop/AIjudge/frontend/src/App.tsx)
- 前端请求封装：[frontend/src/api/client.ts](/c:/Users/QiChuang/Desktop/AIjudge/frontend/src/api/client.ts)

## 注意事项

- 当前后端配置中的 `DIFY_BASE_URL`、API Key、JWT Secret 仍是硬编码，继续开发前建议尽快改为环境变量。
- 仓库当前工作区存在未提交修改，写文档或联调前建议先确认本地变更范围。
