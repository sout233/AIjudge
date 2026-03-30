import re
from app.captcha.cutter import slice_captcha_in_memory
from app.captcha.color import get_main_color, get_color_name_cn
from app.captcha.predictor import CaptchaPredictor


class InstructionParser:
    @staticmethod
    def parse(text):
        colors = ["红色", "绿色", "蓝色", "黄色", "灰色", "白色"]
        orient_map = {"正向": "正常", "侧向": "旋转"}
        chars = re.findall(r"([a-zA-Z0-9])", text)

        result = {
            "text": text,
            "is_relative": "一样" in text,
            "base": {"char": None, "color": None, "orient": None},
            "target": {"char": None, "color": None, "orient": None, "case": None}
        }

        if result["is_relative"] and len(chars) >= 2:
            parts = text.split("一样")
            pre_part = parts[0]
            post_part = parts[1]
            result["base"]["char"] = chars[0]
            result["base"]["color"] = next((c for c in colors if c in pre_part), None)
            if "颜色" in pre_part:
                result["rel_type"] = "color"
            elif "朝向" in pre_part or "形态" in pre_part:
                result["rel_type"] = "orient"
            if "小写" in post_part:
                result["target"]["case"] = "lower"
            elif "大写" in post_part:
                result["target"]["case"] = "upper"
            result["target"]["char"] = chars[1]
        else:
            result["target"]["char"] = chars[-1] if chars else None
            result["target"]["color"] = next((c for c in colors if c in text), None)
            for k, v in orient_map.items():
                if k in text:
                    result["target"]["orient"] = v
                    break
            if "小写" in text:
                result["target"]["case"] = "lower"
            elif "大写" in text:
                result["target"]["case"] = "upper"
        return result


class CaptchaSystem:
    def __init__(self, model_path):
        self.predictor = CaptchaPredictor(model_path)

    def process_image(self, img_path):
        """
        统合逻辑：
        1. 切图 -> 获取 (图片, 坐标)
        2. 遍历 -> 识别颜色 + 识别字符/形态
        """
        raw_patches = slice_captcha_in_memory(img_path)
        final_results = []

        for item in raw_patches:
            patch_img = item["image"]
            color_eng = get_main_color(patch_img)
            color_cn = get_color_name_cn(color_eng)
            char_val, orientation = self.predictor.predict_cv2(patch_img)

            final_results.append({
                "char": char_val,
                "color": color_cn,
                "orientation": orientation,
                "center": item["center"],
                "bbox": {"x": item["x"], "y": item["y"], "w": item["w"], "h": item["h"]}
            })

        return final_results


def get_target_coords(model_path, img_path, instruction_text):
    """
    核心识别函数：输入模型、图片路径、提示词
    返回: [x, y] 坐标 (相对于图片左上角) 或 False
    """
    try:
        system = CaptchaSystem(model_path)
        recognized_list = system.process_image(img_path)
        inst = InstructionParser.parse(instruction_text)

        target_cfg = inst["target"]

        if inst["is_relative"]:
            base_cfg = inst["base"]
            base_obj = next((r for r in recognized_list
                             if r["char"].lower() == base_cfg["char"].lower()
                             and (not base_cfg["color"] or r["color"] == base_cfg["color"])), None)
            if base_obj:
                if inst.get("rel_type") == "color":
                    target_cfg["color"] = base_obj["color"]
                elif inst.get("rel_type") == "orient":
                    target_cfg["orient"] = base_obj["orientation"]

        for item in recognized_list:
            if item["char"].lower() != target_cfg["char"].lower():
                continue
            if target_cfg["case"] == "lower" and not item["char"].islower():
                continue
            if target_cfg["case"] == "upper" and not item["char"].isupper():
                continue
            if target_cfg["color"] and item["color"] != target_cfg["color"]:
                continue
            if target_cfg["orient"] and item["orientation"] != target_cfg["orient"]:
                continue
            return item["center"]

        return False
    except Exception as e:
        print(f"识别模块异常: {e}")
        return False
