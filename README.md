# BIBO Travel

Lena 與 Key 的 2026/12/24–2027/01/03 西安、洛陽、徐州、南京旅遊書。網頁版 PWA，可安裝到手機桌面、離線使用。

- 網址：https://miding0528.github.io/bibo-travel/
- 技術：Vite 6 + 原生 JavaScript（無框架）、Tailwind CSS v3（本機編譯）、vite-plugin-pwa（Workbox generateSW）
- 所有字型、圖示、圖片都自架，建置結果不會連到 googleapis、gstatic、任何 CDN

## 開發

```bash
npm ci            # 第一次安裝
npm run dev       # 開發伺服器，網址 http://localhost:5173/bibo-travel/
npm run build     # 輸出到 dist/
npm run preview   # 預覽建置結果（Service Worker 只在這個模式或正式站才會啟用）
```

網站放在 `/bibo-travel/` 底下（`vite.config.js` 的 `base`），所以本機網址也要帶這段。

## 資料夾

```
index.html              頁面骨架（原型的標記，未改）
src/main.js             主程式（原型的 <script>，邏輯未改；inline onclick 用的函式都掛在 window）
src/styles.css          字型宣告、原型自訂 CSS、Tailwind 指令
src/data/seed.json      種子資料（行程、景點、提醒、清單、票券、匯率、天氣），由試算表管線產生，勿手改
src/fonts/              子集化後的 Noto Serif TC（400/500/700/900）與 Material Symbols Outlined
public/assets/stitch/   景點與吉祥物圖片
public/icons/、public/apple-touch-icon.png、public/favicon.png   PWA 圖示
tailwind.config.js      與原型 index.html 內建設定完全相同的色票、字級、間距
scripts/                字型、圖示、Tailwind 檢查的工具
art/                    圖示來源圖
```

## 部署

推到 `main` 分支，GitHub Actions（`.github/workflows/deploy.yml`）會執行 `npm ci`、`npm run build`，再把 `dist/` 發佈到 GitHub Pages。
第一次使用要到 repo 的 Settings -> Pages，把 Source 設成「GitHub Actions」。

手機打開網站後，Service Worker 會把整個 App（含圖片與字型，約 8.5 MB）存起來。之後有新版會自動更新，下次開啟時生效。

## 資料管線（試算表 <-> App）

行程等內容的主檔是 Google 試算表（本機副本 `sheet/bibo-travel-data.xlsx`，在這個 repo 外面）。流程：

1. 取得試算表的 xlsx。
2. `python sheet/tools/sheet_to_app.py 檔案.xlsx --dry-run` 看變更報告。
3. 沒問題去掉 `--dry-run` 正式匯入，會寫入 `src/data/seed.json` 並把 `seedVersion` +1（舊資料會先備份到 `sheet/backup/`）。
4. `python sheet/tools/app_to_sheet.py` 重新產生 xlsx（帶上自動編的新 ID）。
5. `npm run build` 確認沒問題，commit 並 push，網站就會更新；手機下次開啟會依 `seedVersion` 同步新種子。

隱私：票券的「訂位代號」「行程單 PDF」只存在 xlsx 與本機的 `sheet/private/`，匯入時預設不會寫進 `seed.json`（`--strip-private`，預設開啟）。
PDF 檔、護照等個資不要放進這個 repo（`.gitignore` 已排除 `*.pdf`）。

## 同步（Supabase，階段 1）

兩支手機用「行程代碼＋暱稱」加入同一個行程，資料即時同步；離線照常使用，恢復連線後自動送出（同一筆以最後寫入為準）。

- 後端：Supabase 專案 `bibo-travel`（ref `ksaluzkbeejrlmihqksq`）。資料表 `trips`、`members`、`items`（一筆資料一列，`collection` 分 `dayItem`、`checklist`、`ticket`、`expense`、`customSpot`、`meta`），全部啟用 RLS：沒加入行程（`members`）就讀不到任何東西。加入只能透過 RPC `join_trip`。
- 登入：Supabase 匿名登入。**專案後台 Authentication -> Sign In / Providers -> 必須開啟「Allow anonymous sign-ins」**，否則 App 會顯示「專案尚未開啟匿名登入」。
- 前端：`src/sync.js`（同步引擎，不碰 DOM）、`src/sync-ui.js`（加入視窗、分帳設定裡的行程區塊）、`src/supabase.js`（連線常數，publishable 金鑰可公開）。主程式只在 `persist()` 後多呼叫一次 `Sync.onPersist()`，其餘畫面程式未改。
- 本機狀態（localStorage）：`bibo-sync-trip`（已加入的行程）、`bibo-sync-base`（最後一次處理過的快照，用來比對出變更）、`bibo-sync-outbox`（待送出）、`bibo-sync-meta`。
- 除錯：`window.__biboOffline = true` 會讓同步器當作離線（關掉後呼叫 `__biboSync.flush()` 或觸發 online 事件）；`__biboSync.status()` 看待送出筆數。
- 問 BIBO 的對話（`chat`）、今天選的日期、種子版本標記只存本機，不同步。
- 種子資料升級：已加入行程的手機，等抓完雲端資料後才執行 seedSync，結果寫回雲端並更新 `trips.seed_version`。

測試：`npm run test:sync`（假的 Supabase，在 Node 內模擬兩支手機：即時、離線、重新載入、衝突、種子升級）。`tests/sync/real-e2e.mjs` 是對真的後端跑的版本（需先開啟匿名登入）。

## 私人票券資料（階段 3a）

訂位代號與行程單 PDF 不進 repo、不進 `seed.json`，放在 Supabase：

- 私有 Storage bucket `trip-files`（上限 10 MB，只收 PDF 與圖片）。檔案路徑一律 `<trip_id>/...`，RLS 只允許該行程的成員讀寫（`private.is_member_of_path`）。
- `items` 新增集合 `ticketPrivate`（每張票一列：`{ bookingCodes, files:[{label, path}] }`）。App 只讀、不回寫；同步引擎把它放進 `STORE.ticketPrivate`。資料表有一個 trigger（`zz_items_guard_ticket_private`），舊版 App 對它寫刪除標記時會被當作沒事發生。
- 票券頁的 PDF 按鈕會即時向 Storage 要一個 10 分鐘有效的簽名網址再開新分頁；離線或失敗會跳提示。
- 上傳（本機手動，不在 CI）：`node scripts/push-private.mjs BIBO-KAMF-26`。來源是 `sheet/private/tickets-private.json` 與 `prototype-v3/tickets/*.pdf`（可用 `--private`、`--pdf-dir` 改）。腳本以暱稱「上傳工具」匿名加入、上傳、寫入 `ticketPrivate`，最後呼叫 `leave_trip()` 離開行程；之後暫時的匿名使用者可在後台刪除。
- RPC `leave_trip(p_trip)`：刪掉呼叫者自己的成員列。設定裡的「離開行程」按鈕會呼叫它（離線時只清本機）。

## 問 BIBO 與匯率（Supabase Edge Functions，階段 2）

- `supabase/functions/ask-bibo`：代理 DeepSeek（`deepseek-chat`，非串流，30 秒逾時）。金鑰放在 Supabase 密鑰 `DEEPSEEK_API_KEY`，不進 repo、不進前端。只有已加入行程的人能呼叫（否則 403）；同一人 24 小時內超過 60 次回 429（紀錄在 `ask_log`，用戶端完全讀不到）。回答一律繁體中文，票價、開放時間、班次、預約一律回答「沒辦法確認」。
- `supabase/functions/fx-rate`：每天一次取台灣銀行牌告人民幣即期賣出（失敗改現金賣出），存進 `fx_rates`（成員可讀、只有 service role 可寫）。**台銀網站對腳本請求會回 JavaScript 驗證頁（Challenge Validation），抓不到 CSV 時改用 open.er-api.com 的中間價當備援，`source` 欄位會註明來源。**
- 前端：`Sync.callFunction(name, body)` 呼叫兩支函式。取回的匯率只放在 `DATA.fxRates` 的「今天」那一格（`localStorage` 的 `bibo-fx-cache` 記住當天已抓過），分帳設定裡手動改過的匯率永遠優先。問 BIBO 的對話只存本機。
- 部署：兩支函式都開 JWT 驗證（`verify_jwt`），兩個資料夾裡的 `common.ts` 必須保持一致。`supabase/migrations/` 是已套用的 SQL 紀錄。
- 對真實後端的檢查：`node tests/sync/real-phase2.mjs BIBO-XXXX-XX`（會建立匿名使用者，跑完要清掉）。

## 字型與圖示

- Noto Serif TC 只包含 App 實際用到的字（原型 HTML、試算表、content 文件）加上 ASCII、CJK 標點、全形字元。使用者在 App 內輸入了字型裡沒有的罕見字，會自動改用系統的明體。
- Material Symbols Outlined 只留下用到的圖示（連字名稱不變，`<span class="material-symbols-outlined">edit_note</span>` 照舊可用）。
- 新增圖示名稱或大量新字之後，重新產生：

```bash
npm i --no-save @expo-google-fonts/noto-serif-tc material-symbols   # 來源字型很大，不放進 package.json
pip install fonttools brotli openpyxl
python scripts/build_fonts.py            # 或加 --common 另外收進 Big5 常用字 5401 字（每個字重多約 0.8 MB）
python scripts/build_icons.py            # 重做 PWA 圖示（需要 Pillow）
```

## Tailwind 與原型的差異

原型用 `cdn.tailwindcss.com`（掃描執行中的 DOM），這裡改成編譯時掃描原始碼（`tailwind.config.js` 的 `content`）：

- JS 字串裡的 `\'` 跳脫會先還原再掃描（否則 `after:content-['']` 會漏掉）。
- 用字串拼接組出來的 class 掃不到。目前沒有這種寫法；若新增，請寫完整 class 名稱，或加進 `safelist`。
- `npm run build && npm run audit:tailwind` 會檢查原始碼中每個 Tailwind 認得的 class 是否真的進了 CSS。
