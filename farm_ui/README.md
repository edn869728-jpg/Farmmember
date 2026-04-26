# farm_ui 資源目錄說明

本目錄存放農場遊戲介面所需的全部視覺資源，並透過子目錄進行分類管理。

## 目錄結構

```
farm_ui/
├── rename_mapping.csv   # 原始檔名 → 最終檔名對應表
├── rename_assets.py     # 自動重新命名腳本
├── README.md            # 本說明文件
└── <子目錄>/
    ├── bg/              # 背景圖片
    │   ├── bg_farm.jpg      農場主背景
    │   └── bg_main.jpg      主畫面背景
    ├── ui/              # 介面元件
    │   ├── ui_topbar.png        頂部導航列
    │   ├── ui_navbar_full.png   底部導航列
    │   ├── icon_crown.png       VIP 皇冠圖示
    │   ├── ui_avatar_frame.png  頭像框
    │   ├── ui_avatar_profile.png 個人頭像
    │   └── card_member_full.png 會員卡
    ├── btn/             # 按鈕
    │   ├── btn_harvest.png  收穫按鈕
    │   └── btn_water.png    澆水按鈕
    ├── sign/            # 招牌 / 標示
    │   ├── sign_shop.png    商店招牌
    │   ├── sign_event.png   活動招牌
    │   └── sign_group.png   群組招牌
    └── crop/            # 作物圖片（各階段）
        ├── cabbage_item.png
        ├── carrot_item.png
        ├── corn_item.png
        ├── strawberry_item.png
        ├── watermelon_item.png
        └── <crop>_stage_<0-5>_<狀態>.png
```

## 子目錄用途說明

| 目錄 | 用途 |
|------|------|
| `bg/` | 遊戲各場景背景圖 |
| `ui/` | 導航列、頭像框、會員卡等介面元件 |
| `btn/` | 互動按鈕（澆水、收穫等） |
| `sign/` | 場景中的招牌或標示圖 |
| `crop/` | 各種作物的道具圖及生長階段圖（stage 0–5） |

## 如何執行 rename_assets.py

1. 將所有**原始檔案**放置在 `farm_ui/` 根目錄下（名稱需與 `rename_mapping.csv` 的 `original_name` 欄位一致）。
2. 確認已安裝 Python 3。
3. 在終端機執行：

```bash
cd farm_ui
python rename_assets.py
```

4. 腳本會自動：
   - 建立所需子目錄（`bg/`、`ui/`、`btn/`、`sign/`、`crop/`）
   - 將每個原始檔案移動並重新命名到對應路徑
   - 輸出每筆操作結果（`[OK]` 或 `[NOT FOUND]`）
   - 最後顯示成功與找不到的檔案數量統計
