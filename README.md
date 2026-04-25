# 🌾 Farmmember

LINE LIFF 會員農場小遊戲 — 純 HTML / CSS / JS 前端 + Google Apps Script (GAS) 後端
與 Google Sheet 會員試算表整合，並透過 LINE Messaging API 推播通知。

## 專案結構

```
.
├── index.html          # 主遊戲入口（LIFF）
├── style.css           # 主遊戲樣式
├── game.js             # 主遊戲邏輯（前端）
├── farm_ui/            # 圖像化 UI 原型（可獨立部署為靜態頁面）
│   ├── index.html
│   └── assets/         # 原型用 PNG 素材
├── src/
│   ├── code.gs         # GAS Web App 後端（doGet / doPost / 天氣 / 觸發器）
│   ├── notify.gs       # LINE 推播輔助
│   └── *.png           # 作物分階段素材（保留供未來圖像化升級）
├── assets/             # 主遊戲資源資料夾（目前以 emoji 顯示作物）
├── appsscript.json     # GAS 專案 manifest
└── .clasp.json         # clasp 部署設定
```

## 部署步驟

### 1. Google Apps Script 後端

1. 建立 Google 試算表，新增名為 `members` 的工作表。
   欄位順序（A–AO）請參考 `src/code.gs` 開頭的 `COL` 定義（共 41 欄）。
2. 安裝 [`clasp`](https://github.com/google/clasp) 並登入：
   ```bash
   npm install -g @google/clasp
   clasp login
   ```
3. 在本專案根目錄編輯 `.clasp.json` 的 `scriptId`，然後推送：
   ```bash
   clasp push
   ```
4. 在 Apps Script 編輯器 → **專案設定** → **指令碼屬性**新增：
   - `SPREADSHEET_ID` = 你的試算表 ID
   - `LINE_CHANNEL_ACCESS_TOKEN` = LINE Messaging API 的 Channel Access Token
   - `CWA_API_KEY` = 中央氣象署 [開放資料平台](https://opendata.cwa.gov.tw/) API Key
5. 部署為 Web App：**部署** → **新增部署作業** → 類型 **網頁應用程式** →
   執行身分 **我**、可存取 **任何人**。複製產生的 `/exec` URL。
6. 在 GAS 編輯器設定每日觸發器：執行 `dailyTrigger`，時間驅動 → 每天 07:00。

### 2. LINE LIFF 前端

1. 將整個專案推送到任何靜態主機（GitHub Pages / Netlify / Cloudflare Pages 皆可）。
2. 到 LINE Developers 建立 LIFF App，Endpoint 指向你的 `index.html`。
3. 編輯 `game.js` 開頭的 `CONFIG`：
   ```js
   const CONFIG = {
     LIFF_ID:  '你的 LIFF ID',
     GAS_URL:  '上一步取得的 GAS /exec URL',
   };
   ```
4. 重新部署前端。

### 3. iPhone 捷徑（店員結帳累點）

捷徑掃描會員 QR Code 取得 `lineUserId`，輸入消費金額後 POST 到 GAS：

```json
POST {GAS_URL}
{
  "action": "add_points",
  "line_user_id": "Uxxxxxxxxxxx",
  "amount": 250
}
```

後端會以 `Math.floor(amount / 5)` 換算點數、寫回試算表並推播 LINE 通知。

## 功能總覽

| 模組 | 說明 |
|------|------|
| 種植 / 收成 | 3×5 共 15 格農田、5 種作物、14 天日制成長 |
| 天氣引擎 | 中央氣象署埔里站 (C0I090) 即時資料；雨量 / 高溫影響成長與枯萎 |
| 澆水 | 每日一次；下大雨自動禁用；連續 3–5 天未澆水枯萎 |
| 兌換點 | 每收成 1 株 → 對應作物 +1 點；集滿 15 點到實體店兌換 |
| LINE 推播 | 點數累積、到期前 30 天提醒、乾旱/豪雨警告 |
| 點數有效期 | 滾動式 1 年；過期自動歸零 |
| QR Code | LIFF userId 顯示為 QR；店員 iPhone 捷徑掃描即可累點 |

## 驗證

無建置流程；用 Node 檢查語法：

```bash
node --check game.js
node -e "new Function(require('fs').readFileSync('src/code.gs','utf8'))"
node -e "new Function(require('fs').readFileSync('src/notify.gs','utf8'))"
```

外部相依（CDN，於 `index.html` 中）：

- `https://static.line-scdn.net/liff/edge/2/sdk.js`
- `https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js`
