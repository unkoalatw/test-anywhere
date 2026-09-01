# Google Apps Script (GAS) 雲端試算表同步部署指南

本系統提供強大的 Google 試算表自動建立、樣式格式化與雙向雲端同步功能。透過本指南，您可以在 3 分鐘內完成 Google 試算表與 Web App API 的串接。

---

## 步驟 1：建立 Google 試算表

1. 前往 [Google 試算表 (Google Sheets)](https://sheets.new) 建立一張全新的空白試算表。
2. 將試算表命名為：`國中會考學業成績智慧彙整資料庫`。

---

## 步驟 2：建立 Apps Script 專案

1. 在試算表上方選單點選 **「擴充功能」 (Extensions) ➔「Apps Script」**。
2. 刪除編輯器中的預設程式碼，開啟本專案中的 `gas/Code.gs` 檔案。
3. 將 `Code.gs` 的全部內容完整複製並貼上到 Apps Script 編輯器中。
4. 點擊上方的 **「儲存專案」 (Save)** 圖示（磁碟片圖示或 Ctrl+S）。

---

## 步驟 3：部署為 Web 應用程式 (Web App)

1. 點擊右上角藍色的 **「部署」 (Deploy) ➔「新增部署」 (New deployment)**。
2. 點擊左側齒輪圖示，選擇 **「網頁應用程式」 (Web app)**。
3. 填寫部署設定（非常關鍵）：
   - **說明 (Description)**：`CAP 成績同步 API v1`
   - **執行身分 (Execute as)**：**`我 (Me / 您的 Google 帳號)`**
   - **誰可以存取 (Who has access)**：**`任何人 (Anyone)`** *(注意：必須選擇 Anyone，瀏覽器前端才能透過 POST/GET 進行資料同步)*
4. 點擊 **「部署」 (Deploy)**。
5. 首次部署時，Google 會要求授權存取試算表：
   - 點選「審查權限 (Review Permissions)」➔ 選擇您的 Google 帳號 ➔ 點擊「進階 (Advanced)」➔ 點擊「前往... (不安全)」➔ 點擊「允許 (Allow)」。
6. 複製彈窗中產生的 **「網頁應用程式網址 (Web app URL)」**（格式類似 `https://script.google.com/macros/s/AKfycb.../exec`）。

---

## 步驟 4：在系統中設定並一鍵格式化

1. 回到本成績管理系統網頁。
2. 點擊右上角或側邊欄的 **「⚙️ 雲端同步與設定」**。
3. 將剛才複製的 **Web App URL** 貼入「Google Apps Script API 網址」欄位中。
4. 點擊 **「測試連線」**：系統會自動進行 Ping 測試並顯示連線成功狀態。
5. 點擊 **「一鍵格式化雲端試算表」** 或 **「立即同步至雲端」**。
6. 回到您的 Google 試算表，您會發現系統已自動建立了五大專業工作表（模擬考會考專區、定期段考評量、小考評量紀錄、目標高中與志願、系統設定與備份），並套用了精美的深藍標題列與自適應欄寬！

---

## CORS 技術細節說明

- 本系統前端透過 `text/plain;charset=utf-8` 的 Content-Type 發送 JSON 封裝，可徹底避免瀏覽器發出 OPTIONS 預檢請求（Preflight Request），徹底解決 Google Apps Script 常見的 CORS 跨域封鎖問題。
