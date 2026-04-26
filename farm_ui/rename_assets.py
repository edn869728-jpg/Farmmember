#!/usr/bin/env python3
"""
rename_assets.py
讀取 rename_mapping.csv，將 farm_ui/ 目錄下的原始資源檔案
移動並重新命名到對應子目錄。

執行方式：
    cd farm_ui
    python rename_assets.py
"""

import csv
import os
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "rename_mapping.csv")


def main():
    if not os.path.exists(CSV_PATH):
        print(f"[ERROR] 找不到 CSV 檔案：{CSV_PATH}")
        return

    success = 0
    not_found = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            original = row["original_name"].strip()
            final = row["final_name"].strip()

            src = os.path.join(SCRIPT_DIR, original)
            dst = os.path.join(SCRIPT_DIR, final)

            # 自動建立目標子目錄
            os.makedirs(os.path.dirname(dst), exist_ok=True)

            if os.path.exists(src):
                shutil.move(src, dst)
                print(f"[OK]       {original}  →  {final}")
                success += 1
            else:
                print(f"[NOT FOUND] {original}")
                not_found += 1

    print(f"\n完成：{success} 個檔案已移動，{not_found} 個找不到來源。")


if __name__ == "__main__":
    main()
