import json
import os


class CoordManager:
    def __init__(self, storage_path="patches/metadata.json"):
        self.storage_path = storage_path
        self.data = {}

    def add_record(self, file_name, x, y, w, h):
        """
        计算并添加一个坐标记录
        """
        center_x = x + w // 2
        center_y = y + h // 2

        self.data[file_name] = {
            "center": [center_x, center_y],
            "bbox": [x, y, w, h]
        }

    def save_to_file(self):
        """
        将所有坐标存入独立文件
        """
        # 确保目录存在
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)

        with open(self.storage_path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, indent=4)
        print(f"📍 坐标清单已更新: {self.storage_path}")

    def get_pos(self, file_name):
        """
        读取特定切片的坐标
        """
        if not self.data:
            with open(self.storage_path, 'r') as f:
                self.data = json.load(f)
        return self.data.get(file_name, {}).get("center")