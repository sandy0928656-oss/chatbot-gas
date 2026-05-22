# CHATBOT

這是一個可放到 Google Apps Script 的正式聊天頁面。前端是 `index.html`，後端是 `Code.gs`，對話會透過 OpenAI Responses API 使用 `gpt-5.4-mini` 回覆，並把使用者與 CHATBOT 的所有訊息寫入指定 Google 試算表。

## 檔案

- `index.html`：聊天頁面，包含語音輸入、Enter 送出、24 小時制日期時間、深色模式、複製對話與清除畫面對話。
- `Code.gs`：GAS 後端，負責呼叫 OpenAI、寫入試算表、提供 `doGet`、`doPost` 與 `chatWithBot`。
- `appsscript.json`：Apps Script 專案設定與權限範圍。

## GAS 部署

1. 在 Apps Script 專案中建立 HTML 檔，名稱用 `index`，貼上 `index.html` 的內容。
2. 建立或覆蓋 `.gs` 檔，貼上 `Code.gs` 的內容。
3. 專案設定中的 Script properties 保留你已設定的 `OPEN_API_KEY`；程式也支援 `OPENAI_API_KEY`。
4. 確認 `CHATBOT_CONFIG.spreadsheetId` 是 `1uRcRNLEhWBYJzbAvJJbE4tvhDqmoDiQ5HGKOMy11bCs`。
5. 執行 `setupChatbotSheet` 一次，授權後會建立 `CHATBOT_LOG` 工作表與欄位。
6. 重新部署 Web App，執行身分選「我」，存取權依你的需求設定。

## 試算表欄位

紀錄欄位包含日期、時間、完整時間戳記、會話 ID、角色、內容、模型、客戶端時間、瀏覽器與 OpenAI 請求 ID。時間格式使用 `Asia/Taipei` 與 24 小時制。

## OpenAI

程式使用 Responses API：`https://api.openai.com/v1/responses`。OpenAI 金鑰只在 GAS 後端讀取，不會出現在 HTML 前端。
