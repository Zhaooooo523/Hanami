# 花見｜信用卡花費帳本

花見是一款以手機為優先、重視隱私的信用卡支出追蹤 PWA。它能管理多張信用卡、記錄消費、計算本月花費與剩餘額度，並可安裝到 iPhone 主畫面使用。

## 主要功能

- 管理多張信用卡、額度、結帳日與繳款截止日
- 手動新增信用卡消費
- 貼上銀行消費通知，解析金額、日期與卡號末四碼
- 查看本月累積花費、剩餘額度與額度使用率
- 依消費分類統計支出
- 匯出完整 JSON 備份與 CSV 明細
- 從 JSON 備份還原資料
- 支援 PWA 與基本離線使用
- 可切換霧藍、晴空藍與薰衣草藍配色

## 資料與隱私

信用卡及消費紀錄只會儲存在目前瀏覽器的 IndexedDB，不會寫入 GitHub repository，也不會隨網站程式上傳。

請注意：

- 不要使用無痕瀏覽模式。
- 清除 Safari 網站資料或移除 PWA，可能會使本機紀錄消失。
- 建議每月至少匯出一次 JSON 備份並存入 iCloud Drive。
- 系統只需要信用卡末四碼，不應輸入完整卡號、有效期限或安全碼。

## 本機開發

### 系統需求

- Node.js `22.13.0` 以上
- npm

### 安裝與執行

```bash
npm install
npm run dev
```

完成後，依終端機顯示的本機網址開啟網站。

### 建置檢查

```bash
npm run build
```

## GitHub 上的「原始碼」與「網站」有什麼不同？

目前 GitHub repository 已保存花見的原始碼，但這不代表 GitHub Pages 網站已經啟用。

- 原始碼 repository：`https://github.com/Zhaooooo523/Hanami`
- GitHub Pages 預計網址：`https://zhaooooo523.github.io/Hanami/`
- 目前已發布網站：`https://hanami-card-ledger.sarah920523.chatgpt.site`

## 如何發布到 GitHub Pages

這份專案目前使用 Vinext／Cloudflare Sites 的建置方式，不能只在 GitHub 設定中按一下就直接發布到 Pages。GitHub Pages 只能託管靜態 HTML、CSS 和 JavaScript，因此需要先加入：

1. Next.js 靜態匯出設定。
2. `/Hanami` 子路徑與 PWA 路徑調整。
3. GitHub Actions 自動建置與發布流程。
4. GitHub Pages 的 Actions 發布來源設定。

完成程式調整並推送後，在 GitHub 操作：

1. 開啟 repository 的 **Settings**。
2. 在左側選擇 **Pages**。
3. 將 **Build and deployment → Source** 設為 **GitHub Actions**。
4. 等待 Actions 的 Pages 工作流程完成。
5. 從 Pages 設定頁開啟網站。

### Repository 公開範圍

目前 Hanami repository 是私人狀態：

- GitHub Free 個人帳號若要使用 Pages，通常需要將 repository 改為公開。
- GitHub Pro 可從私人 repository 使用 Pages，但個人帳號的 Pages 網站仍通常是公開網站。
- 真正限制 Pages 網站只讓特定成員瀏覽，主要是 GitHub Enterprise Cloud 組織功能。

即使網站公開，其他訪客也看不到你的消費紀錄，因為每個瀏覽器使用各自獨立的 IndexedDB。不過網站原始碼是否公開，仍取決於 repository 的可見性。

## 更換網址前的重要步驟

瀏覽器會依網址分隔 IndexedDB。從目前網站改到 GitHub Pages 後，既有資料不會自動搬移：

1. 在目前花見網站匯出完整 JSON 備份。
2. 開啟新的 GitHub Pages 網址。
3. 使用「從備份檔還原」匯入 JSON。
4. 將新網址重新加入 iPhone 主畫面。

## 專案技術

- Next.js／React
- Vinext／Vite
- IndexedDB
- Service Worker／PWA
- Cloudflare Sites 相容建置

## 授權

目前此專案未另外宣告開源授權。若 repository 改為公開，其他人可以查看程式碼，但不代表自動取得修改、散布或商業使用權利。
