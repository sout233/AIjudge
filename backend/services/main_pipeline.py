import os
from services.cutter_mem import slice_captcha_in_memory
from services.color_analyzer_mem import get_main_color, get_color_name_cn
from services.mod_used_mem import CaptchaPredictor


class CaptchaSystem:
    def __init__(self, model_path):
        self.predictor = CaptchaPredictor(model_path)

    def process_image(self, img_path):
        """
        统合逻辑：
        1. 切图 -> 获取 (图片, 坐标)
        2. 遍历 -> 识别颜色 + 识别字符/形态
        """
        # if not os.path.exists(img_path):
        #     return {"error": f"File not found: {img_path}"}

        # 1. 调用切图逻辑 (数据存入内存)
        raw_patches = slice_captcha_in_memory(img_path)

        final_results = []

        # 2. 流转数据
        for item in raw_patches:
            patch_img = item['image']

            # 颜色分析
            color_eng = get_main_color(patch_img)
            color_cn = get_color_name_cn(color_eng)

            # 字符与形态识别
            char_val, orientation = self.predictor.predict_cv2(patch_img)

            # 组装结果
            final_results.append({
                "char": char_val,
                "color": color_cn,
                "orientation": orientation,
                "center": item['center'],
                "bbox": {"x": item['x'], "y": item['y'], "w": item['w'], "h": item['h']}
            })

        return final_results


if __name__ == "__main__":
    # 使用示例
    MODEL_FILE = "../captcha_multi_task.pth"
    TEST_IMAGE = "test2.png"

    if os.path.exists(MODEL_FILE):
        system = CaptchaSystem(MODEL_FILE)
        results = system.process_image(TEST_IMAGE)

        print(f"{'字符':<5} | {'颜色':<5} | {'形态':<5} | {'中心坐标':<15}")
        print("-" * 45)
        for res in results:
            print(f"{res['char']:<5} | {res['color']:<5} | {res['orientation']:<5} | {str(res['center']):<15}")
    else:
        print("请确保模型文件存在。")