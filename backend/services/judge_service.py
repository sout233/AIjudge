import uuid
import json
import os
import shutil
import hashlib
import zipfile
import asyncio
import tempfile
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, Depends

from config import CONTEST_FILE, RESULT_DIR, RULE_DIR, UPLOAD_DIR, DEMO_MODE
from dify import run_workflow_with_file, upload_file_to_dify
from services.auth_service import get_current_user_name
from services.duplicate_service import check_duplication
from models.schemas import (
    JudgeRequest, JudgeResponse, WorkflowStatus,
    BatchJudgeRequest, ZipBatchJudgeRequest, FileItem
)

router = APIRouter()

JUDGE_SEMAPHORE = asyncio.Semaphore(3)

# ================= 工具函数 =================

def atomic_write_json(path: str, data: dict):
    dir_name = os.path.dirname(path)
    if not os.path.exists(dir_name):
        os.makedirs(dir_name, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp", text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, path)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise e

def load_contests():
    if not os.path.exists(CONTEST_FILE):
        return []
    with open(CONTEST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def _get_track_rule_id(contest_id: str, track_id: str | None) -> str:
    return track_id if track_id else contest_id

# ================= 预设演示 Mock 库 =================
# ================= 预设演示 Mock 库 (严格遵循 Dify 提示词规范) =================
PRESET_DEMO_RESULTS = {
    "全息脑机接口": {"base": 90, "desc": "脑机接口与全息显示技术结合"},
    "低空飞翔": {"base": 86, "desc": "eVTOL与红色文化传承项目"},
    "东北二人转": {"base": 84, "desc": "黑土地文化数字化传承方案"},
    "数字孪生": {"base": 88, "desc": "超维营造被动房数字孪生"},
    "旅行金融决策": {"base": 85, "desc": "基于智能算法的金融平台"},
    "数智非遗": {"base": 87, "desc": "AR技术赋能非遗传承项目"},
    "跨文化传播": {"base": 86, "desc": "智能跨文化传播生态引擎"},
    "龙江甄选": {"base": 83, "desc": "雪域冰城探秘小程序项目"},
    "数字助老": {"base": 89, "desc": "智绘银龄数字助老方案"},
    "AIGC内容营销": {"base": 91, "desc": "AIGC全链路内容营销方案"}
}

def get_preset_mock(filename: str):
    match = None
    for key, data in PRESET_DEMO_RESULTS.items():
        if key in filename:
            match = data
            break
    if not match: return None

    project_name = filename.replace(".pdf", "")

    def create_judge_data(tag, style, offset):
        total = match["base"] + offset
        d1_score = round(total * 0.4, 1)
        d2_score = round(total * 0.3, 1)
        d3_score = round(total * 0.3, 1)

        # 更加专业化的理由库
        reasons = {
            "A": [
                "系统底层架构解耦充分，核心算法在处理复杂非结构化数据时展现了极高的计算效率与稳健性。",
                "虽然技术路径可行，但针对高并发场景下的数据状态同步机制描述略显单薄，存在潜在的系统延迟风险。"
            ],
            "B": [
                "项目精准捕捉了现有市场在数字化转型中的服务盲区，其创新的商业模式具备极强的用户粘性与增量空间。",
                "核心竞争壁垒主要依赖于资源整合，在面对巨头快速切入同类赛道时的差异化防御策略还需进一步深挖。"
            ],
            "C": [
                "项目整体执行方案详尽，关键里程碑节点的设置与资源投入配比科学，展现了极强的项目管控与落地能力。",
                "方案在跨部门协同与长周期运营中的合规性风险管理描述不足，财务预算的可预测性模型有待进一步细化。"
            ]
        }

        # 更加具体专业的建议库
        improves = {
            "A": ["建议引入分布式一致性协议优化同步逻辑。", "需补充在极端弱网环境下的数据容灾测试数据。"],
            "B": ["应深研竞品动态，构建基于技术专利的护城河。", "建议细化阶段性营销策略，优化首批用户获客成本。"],
            "C": ["推荐引入项目管理矩阵，增强各环节的监控力度。", "需细化财务模型中变动成本的敏感度分析。"]
        }

        return {
            "judge_tag": tag,
            "judge_style": style,
            "total_score": round(d1_score + d2_score + d3_score, 1),
            "max_score": 100,
            "dimensions": [
                {
                    "dimension_name": "创新性与技术力",
                    "dimension_weight": 0.4,
                    "dimension_max_score": 40,
                    "dimension_score": d1_score,
                    "points": [
                        {"point_name": "核心技术逻辑", "score": round(d1_score * 0.6, 1), "max_score": 24, "reason": reasons[tag][0], "improve": improves[tag][0]},
                        {"point_name": "方案创新程度", "score": round(d1_score * 0.4, 1), "max_score": 16, "reason": "项目在现有技术框架下实现了跨维度的应用创新，具备行业领先的工程化实践价值。", "improve": "建议对比现有开源方案，明确自研模块的技术优势。"}
                    ]
                },
                {
                    "dimension_name": "市场价值与前景",
                    "dimension_weight": 0.3,
                    "dimension_max_score": 30,
                    "dimension_score": d2_score,
                    "points": [
                        {"point_name": "痛点解决能力", "score": round(d2_score * 0.5, 1), "max_score": 15, "reason": reasons[tag][1], "improve": improves[tag][1]},
                        {"point_name": "商业模式闭环", "score": round(d2_score * 0.5, 1), "max_score": 15, "reason": "其闭环链路逻辑自洽，在获客、转化与存留等核心环节的财务模型设计展现了较强的可持续性。", "improve": "需进一步细化在市场波动环境下的盈利压测报告。"}
                    ]
                },
                {
                    "dimension_name": "可行性与完整性",
                    "dimension_weight": 0.3,
                    "dimension_max_score": 30,
                    "dimension_score": d3_score,
                    "points": [
                        {"point_name": "执行计划详尽", "score": round(d3_score * 0.5, 1), "max_score": 15, "reason": "项目进度安排紧凑且合理，核心任务的分配充分考量了现有资源的承载上限，具备高度的可操作性。", "improve": "建议补充关键技术负责人的具体项目执行经验。"},
                        {"point_name": "风险控制预案", "score": round(d3_score * 0.5, 1), "max_score": 15, "reason": "建立了基础的风险预警体系，在应对技术迭代与政策波动方面表现稳健，整体执行风险处于可控区间。", "improve": "推荐构建更具前瞻性的动态风险评估决策模型。"}
                    ]
                }
            ],
            "overall_comment": f"【评委{tag}综述】该项目在{match['desc']}领域展现了深厚的积累与独特的创新视角。虽然在部分深度技术细节与长线财务预测方面仍有打磨空间，但整体方案架构宏大且逻辑缜密，体现了新文科背景下跨学科融合的优秀范式。其商业潜力与社会价值兼具，是当前同赛道中具备极高竞争力的优质作品。"
        }

    return {
        "project_name": project_name,
        "evaluations": [
            create_judge_data("A", "严谨技术专家", -3.5),
            create_judge_data("B", "创新与市场专家", 2.1),
            create_judge_data("C", "综合管理专家", 0.0)
        ]
    }

# ================= 业务接口 =================

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    file_hash = hashlib.md5(content).hexdigest()
    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_hash}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    if os.path.exists(path):
        return {"success": True, "filename": filename, "original_name": file.filename, "is_cached": True}

    with open(path, "wb") as f:
        f.write(content)
    return {"success": True, "filename": filename, "original_name": file.filename}

# 判分 (单文件)
@router.post("/judge", response_model=JudgeResponse)
async def judge_file(
        data: JudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):

    file_path = os.path.join(UPLOAD_DIR, data.filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "文件不存在")

    rule_id = _get_track_rule_id(data.contest_id, data.track_id)
    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, f"规则配置不存在")

    is_dup, dup_file, similarity = check_duplication(data.contest_id, data.filename)
    if is_dup:
        raise HTTPException(400, detail=f"检测到内容重复，与 '{dup_file}' 相似度 {similarity:.2%}")

    with open(rule_path, "r", encoding="utf-8") as f:
        rule_data = json.load(f)
        score_rule_json = json.dumps(rule_data, ensure_ascii=False, separators=(",", ":"))

    workflow_run_id = uuid.uuid4().hex
    result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
    display_name = data.original_filename or data.filename

    init_state = {
        "status": "running",
        "elapsed_time": 0,
        "messages": [{"text": "任务已启动"}],
        "workflow_data": {},
        "metadata": {
            "contest_id": data.contest_id,
            "track_id": data.track_id,
            "filename": data.filename,
            "original_filename": display_name,
            "user_name": current_user_name,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    }
    atomic_write_json(result_path, init_state)

    async def run_task_with_semaphore():
        async with JUDGE_SEMAPHORE:
            try:
                if DEMO_MODE:
                    # 极速演示模式：优先使用基于文件名的预设数据
                    preset_data = get_preset_mock(display_name)
                    if preset_data:
                        await asyncio.sleep(1.5)
                        atomic_write_json(result_path, {
                            "status": "success",
                            "elapsed_time": 1.5,
                            "messages": [{"text": "正在匹配预设演示数据..."}, {"text": "评审完成"}],
                            "workflow_data": { "data": { "outputs": { "text": preset_data } } },
                            "metadata": init_state["metadata"]
                        })
                        return

                    # 其次尝试克隆现有的成功结果
                    source_data = None

                    if os.path.exists(RESULT_DIR):
                        all_files = [f for f in os.listdir(RESULT_DIR) if f.endswith(".json")]
                        import random
                        random.shuffle(all_files)

                        for f_name in all_files:
                            if f_name.startswith(workflow_run_id): continue
                            try:
                                with open(os.path.join(RESULT_DIR, f_name), "r", encoding="utf-8") as f:
                                    old_data = json.load(f)
                                    if old_data.get("status") in ["success", "succeeded"]:
                                        # 检查是否包含实质性的评分内容 (outputs.text)
                                        wd = old_data.get("workflow_data", old_data)
                                        if wd.get("data", {}).get("outputs", {}).get("text"):
                                            source_data = old_data
                                            break
                            except: continue

                    await asyncio.sleep(1.5) # 模拟一点延迟

                    if source_data:
                        # 找到了真实的历史案例，保持其原始结构
                        final_data = source_data
                        final_data["metadata"] = init_state["metadata"]
                        atomic_write_json(result_path, final_data)
                    else:
                        # 实在找不到，再用保底
                        atomic_write_json(result_path, {
                            "status": "success",
                            "elapsed_time": 1.0,
                            "messages": [{"text": "演示数据 (未发现历史结果)"}],
                            "workflow_data": {
                                "data": {
                                    "outputs": {
                                        "text": {
                                            "project_name": "演示样板项目",
                                            "evaluations": [
                                                {
                                                    "judge_tag": "演示专家",
                                                    "judge_style": "保底",
                                                    "total_score": 80,
                                                    "max_score": 100,
                                                    "overall_comment": "这是在未发现任何历史 JSON 文件时显示的保底数据。请确保 backend/storage/results 目录下有成功的评审记录。",
                                                    "dimensions": []
                                                }
                                            ]
                                        }
                                    }
                                }
                            },
                            "metadata": init_state["metadata"]
                        })
                    return

                file_id = upload_file_to_dify(file_path, data.filename, current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)

                final_data = {
                    "status": result.get("status", "success"),
                    "elapsed_time": result.get("elapsed_time", 0),
                    "messages": result.get("messages", []),
                    "workflow_data": result,
                    "metadata": init_state["metadata"]
                }
                atomic_write_json(result_path, final_data)
            except Exception as e:
                atomic_write_json(result_path, {
                    "status": "error",
                    "messages": [{"text": str(e)}],
                    "metadata": init_state["metadata"]
                })

    background_tasks.add_task(lambda: asyncio.run(run_task_with_semaphore()))
    return JudgeResponse(workflow_run_id=workflow_run_id, filename=data.filename, result_path=f"{workflow_run_id}.json")

# 批量判分
@router.post("/batch_judge")
async def batch_judge_files(
        data: BatchJudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):

    rule_id = _get_track_rule_id(data.contest_id, data.track_id)
    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, "规则不存在")

    with open(rule_path, "r", encoding="utf-8") as f:
        score_rule_json = json.dumps(json.load(f), ensure_ascii=False, separators=(",", ":"))

    tasks_manifest = []
    for item in data.files:
        run_id = uuid.uuid4().hex
        res_path = os.path.join(RESULT_DIR, f"{run_id}.json")
        meta = {
            "contest_id": data.contest_id, "track_id": data.track_id,
            "filename": item.filename, "original_filename": item.original_filename,
            "user_name": current_user_name, "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        # 初始写入
        atomic_write_json(res_path, {"status": "pending", "metadata": meta})

        tasks_manifest.append({
            "workflow_run_id": run_id,
            "filename": item.filename,
            "result_path": res_path,
            "metadata": meta
        })

    background_tasks.add_task(lambda: asyncio.run(execute_batch(tasks_manifest, score_rule_json, current_user_name)))
    return {"tasks": tasks_manifest}

async def execute_batch(manifest, score_rule_json, current_user_name):
    async def process_item(task):
        async with JUDGE_SEMAPHORE:
            try:
                if os.path.exists(task["result_path"]):
                    with open(task["result_path"], "r", encoding="utf-8") as f:
                        curr_data = json.load(f)
                    curr_data["status"] = "running"
                    atomic_write_json(task["result_path"], curr_data)

                if DEMO_MODE:
                    # 极速演示模式：优先使用预设 Mock
                    preset_data = get_preset_mock(task["metadata"].get("original_filename", ""))
                    if preset_data:
                        await asyncio.sleep(1)
                        atomic_write_json(task["result_path"], {
                            "status": "success",
                            "workflow_data": { "data": { "outputs": { "text": preset_data } } },
                            "metadata": task["metadata"]
                        })
                        return

                    source_data = None
                    if os.path.exists(RESULT_DIR):
                        all_files = [f for f in os.listdir(RESULT_DIR) if f.endswith(".json")]
                        import random
                        random.shuffle(all_files)
                        for f_name in all_files:
                            if f_name == os.path.basename(task["result_path"]): continue
                            try:
                                with open(os.path.join(RESULT_DIR, f_name), "r", encoding="utf-8") as f:
                                    old_data = json.load(f)
                                    if old_data.get("status") in ["success", "succeeded"]:
                                        wd = old_data.get("workflow_data", old_data)
                                        if wd.get("data", {}).get("outputs", {}).get("text"):
                                            source_data = old_data
                                            break
                            except: continue

                    await asyncio.sleep(11)
                    if source_data:
                        final_data = source_data
                        final_data["metadata"] = task["metadata"]
                        atomic_write_json(task["result_path"], final_data)
                    else:
                        # 兜底
                        atomic_write_json(task["result_path"], {
                            "status": "success",
                            "workflow_data": { "data": { "outputs": { "text": {"project_name": "批量演示项目", "evaluations": []} } } },
                            "metadata": task["metadata"]
                        })
                    return

                file_path = os.path.join(UPLOAD_DIR, task["filename"])
                file_id = upload_file_to_dify(file_path, task["filename"], current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)

                atomic_write_json(task["result_path"], {
                    "status": result.get("status", "success"),
                    "workflow_data": result,
                    "metadata": task["metadata"]
                })
            except Exception as e:
                atomic_write_json(task["result_path"], {
                    "status": "error",
                    "messages": [{"text": str(e)}],
                    "metadata": task["metadata"]
                })

    await asyncio.gather(*(process_item(t) for t in manifest))

@router.post("/zip_batch_judge")
async def zip_batch_judge(
        data: ZipBatchJudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):
    zip_path = os.path.join(UPLOAD_DIR, data.zip_filename)
    if not os.path.exists(zip_path):
        raise HTTPException(404, "ZIP不存在")

    extract_dir = os.path.join(UPLOAD_DIR, f"extracted_{uuid.uuid4().hex}")
    os.makedirs(extract_dir, exist_ok=True)

    file_items = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            for root, _, files in os.walk(extract_dir):
                for f in files:
                    if f.startswith('.') or f.startswith('__'): continue
                    f_path = os.path.join(root, f)
                    with open(f_path, 'rb') as rb:
                        f_hash = hashlib.md5(rb.read()).hexdigest()
                    new_name = f"{f_hash}{os.path.splitext(f)[1]}"
                    target_path = os.path.join(UPLOAD_DIR, new_name)
                    if not os.path.exists(target_path):
                        shutil.move(f_path, target_path)
                    file_items.append(FileItem(filename=new_name, original_filename=f))
    finally:
        if os.path.exists(extract_dir): shutil.rmtree(extract_dir)

    return await batch_judge_files(BatchJudgeRequest(files=file_items, contest_id=data.contest_id, track_id=data.track_id), background_tasks, current_user_name)

# 历史记录
@router.get("/history")
async def get_history(current_user_name: str = Depends(get_current_user_name)):
    history = []
    if not os.path.exists(RESULT_DIR): return []
    for filename in os.listdir(RESULT_DIR):
        if not filename.endswith(".json") or filename.startswith("manifest"): continue
        path = os.path.join(RESULT_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                meta = data.get("metadata", {})
                if meta.get("user_name") == current_user_name:
                    history.append({
                        "workflow_run_id": filename.replace(".json", ""),
                        "filename": meta.get("original_filename") or meta.get("filename"),
                        "contest_id": meta.get("contest_id"),
                        "track_id": meta.get("track_id"),
                        "status": data.get("status"),
                        "created_at": meta.get("created_at")
                    })
        except: continue
    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return history

@router.get("/judge/{workflow_run_id}/status", response_model=WorkflowStatus)
async def get_status(workflow_run_id: str):
    path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
    if not os.path.exists(path):
        return WorkflowStatus(status="running", elapsed_time=0, messages=[], workflow_data={}, progress="排队中...")

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return WorkflowStatus(status="running", elapsed_time=0, messages=[], workflow_data={}, progress="同步中...")
            data = json.loads(content)

        return WorkflowStatus(
            status=data.get("status", "running"),
            elapsed_time=data.get("elapsed_time", 0),
            messages=data.get("messages", []),
            workflow_data=data,
            progress="\n".join([str(m.get('text', '')) for m in data.get("messages", [])]),
        )
    except (json.JSONDecodeError, UnicodeDecodeError):
        return WorkflowStatus(status="running", elapsed_time=0, messages=[], workflow_data={}, progress="解析中...")
