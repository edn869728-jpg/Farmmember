# Farmmember 上架計畫（Launch Checklist）

本文件整理 Farmmember 專案產品上架（正式上線）所需完成的所有工作，
作為團隊規劃與追蹤上線進度的依據。請依下列章節逐項確認，所有項目完成後方可正式上架。

> 專案技術構成：前端為純 HTML/CSS/JS（`index.html` / `style.css` / `game.js`），
> 後端使用 Google Apps Script（`src/code.gs`、`src/notify.gs`，搭配 Google Sheets 作為資料庫，
> 透過 LINE Messaging API 發送通知）。

---

## 1. 產品定位與內容確認

- [ ] 確認產品名稱、Logo、標語（Slogan）與品牌主視覺
- [ ] 確認目標族群與主要使用情境
- [ ] 撰寫產品簡介（中／英）與功能特色說明
- [ ] 製作產品截圖與宣傳圖（首頁、農場、商店、會員等畫面）
- [ ] 準備宣傳影片或操作 Demo（選用）

## 2. 功能與品質驗收

- [ ] 主要功能完整測試：登入／會員資料、種植、收成、商店、點數、天氣顯示、LINE 通知
- [ ] 邊界情境測試：點數不足、等級升級、點數到期（`point_expire_at`）、離線重連
- [ ] 不同裝置／瀏覽器相容性測試（iOS Safari、Android Chrome、桌面 Chrome／Edge）
- [ ] 響應式（RWD）與行動裝置觸控操作驗證
- [ ] 效能檢查：首次載入時間、資源大小、圖片壓縮
- [ ] `node --check game.js` 等基本語法檢查通過
- [ ] 已知 Bug 全數修復或列入已知問題清單
- [ ] 進行至少一次內部 UAT（使用者驗收測試）

## 3. 後端與資料

- [ ] Google Apps Script 部署為 Web App，記錄正式版部署 URL
- [ ] Spreadsheet 欄位 A–AO（含 `farm` 欄位 AG–AN 與 `point_expire_at` AO）結構檢視
- [ ] Apps Script Properties 設定完成（API Key、LINE Token、Sheet ID 等機敏資訊**勿寫入程式碼**）
- [ ] 資料備份策略（試算表定期備份、版本歷程保留）
- [ ] 測試環境與正式環境分離（不同試算表 / 不同部署）
- [ ] API 流量與配額評估（Apps Script 每日執行配額、LINE 推播配額）

## 4. 安全與隱私

- [ ] 所有 Secret／Token 僅放在 Apps Script Properties，未提交至 Git
- [ ] 檢查 `.gitignore` 是否已排除憑證、暫存與本機設定檔
- [ ] 前端避免直接暴露任何金鑰
- [ ] 使用者輸入皆做基本驗證與必要轉義，避免 XSS／注入
- [ ] 提供隱私權政策與服務條款（蒐集哪些資料、用途、保存期限）
- [ ] 若蒐集個資需符合當地法規（例如台灣個資法）

## 5. 部署與網域

- [ ] 選擇前端託管方案（GitHub Pages / Netlify / Vercel / 自架）
- [ ] 註冊或確認正式網域，設定 DNS
- [ ] 啟用 HTTPS（憑證自動續期）
- [ ] 設定 favicon、PWA manifest、行動裝置圖示（如需安裝至主畫面）
- [ ] 設定 `<meta>` SEO 與 Open Graph 標籤（標題、描述、預覽圖）
- [ ] CI／自動部署流程（GitHub Actions 或 clasp 推送 Apps Script）

## 6. 監控與營運

- [ ] 加入網站分析工具（如 Google Analytics）並確認事件追蹤正確
- [ ] 設置錯誤監控（前端 `window.onerror` 上報；後端 Apps Script log）
- [ ] 建立客服 / 回報管道（Email、LINE、表單）
- [ ] 訂定值班與故障處理 SOP
- [ ] 規劃版本更新與發布節奏

## 7. 法律與合規

- [ ] 確認所有素材（圖片、音效、字型）皆有合法授權
- [ ] 第三方套件授權檢視（License 相容性）
- [ ] 隱私權政策與服務條款上線並可於頁面連結
- [ ] 如有金流或虛擬點數，確認相關法規與稅務

## 8. 行銷與上架平台

- [ ] 建立官方社群帳號（FB／IG／LINE 官方帳號）
- [ ] 撰寫上線公告與新聞稿
- [ ] 預備 FAQ 與使用教學
- [ ] 若需上架應用商店：
  - [ ] App Store / Google Play 開發者帳號申請
  - [ ] 商店描述、關鍵字、分級、隱私揭露表單
  - [ ] 應用程式圖示、截圖、預覽影片符合各平台規格
- [ ] 上線優惠、活動或邀請碼（選用）

## 9. 上線執行（Go-Live）

- [ ] 凍結程式碼（Code Freeze）並建立正式版本 Tag／Release
- [ ] 最終煙霧測試（Smoke Test）：登入、主流程、付費／點數、通知
- [ ] 切換 DNS／發布正式版本
- [ ] 公告上線時間並通知所有相關人員
- [ ] 監控首日流量、錯誤率與使用者回饋

## 10. 上線後追蹤

- [ ] 收集使用者回饋並列入待辦
- [ ] 定期檢視使用數據與留存指標
- [ ] 規劃首個版本更新（Hotfix / Minor Release）
- [ ] 撰寫上線回顧（Retrospective）

---

> 本清單為通用版本，實務上請依專案進度與商業需求調整。每一項完成後，
> 建議在對應 Issue / PR 中留下連結以利追蹤。
