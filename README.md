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
