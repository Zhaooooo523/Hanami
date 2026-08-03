"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Card = {
  id: string;
  bank: string;
  name: string;
  last4: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  cardId: string;
  amount: number;
  merchant: string;
  category: string;
  date: string;
  note: string;
  createdAt: string;
};

type AppData = { cards: Card[]; transactions: Transaction[] };
type Modal = "expense" | "card" | "paste" | "backup" | null;
type Theme = "mist" | "sky" | "lavender";

const categories = ["餐飲", "交通", "購物", "生活", "娛樂", "醫療", "其他"];
const cardColors = ["#557da6", "#78a9c7", "#657aac", "#879fc1", "#4f8a9d"];
const themes: { id: Theme; name: string; description: string; colors: string[] }[] = [
  { id: "mist", name: "霧藍", description: "安靜柔和", colors: ["#557da6", "#dfeaf5", "#f1f6fb"] },
  { id: "sky", name: "晴空藍", description: "清爽明亮", colors: ["#3f83a6", "#d9eef7", "#f0f8fb"] },
  { id: "lavender", name: "薰衣草藍", description: "溫柔雅緻", colors: ["#6475a7", "#e3e6f4", "#f5f5fb"] },
];
const DB_NAME = "spendlight-local";
const DB_VERSION = 1;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
      if (!db.objectStoreNames.contains("transactions")) {
        const store = db.createObjectStore("transactions", { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("cardId", "cardId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
    request.transaction?.addEventListener("complete", () => db.close());
  });
}

async function putItem<T>(storeName: string, value: T) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteItem(storeName: string, id: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function replaceAll(data: AppData) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["cards", "transactions"], "readwrite");
    const cardsStore = tx.objectStore("cards");
    const transactionsStore = tx.objectStore("transactions");
    cardsStore.clear();
    transactionsStore.clear();
    data.cards.forEach((item) => cardsStore.put(item));
    data.transactions.forEach((item) => transactionsStore.put(item));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

const money = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency", currency: "TWD", maximumFractionDigits: 0,
}).format(value);

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function parseNotification(text: string, cards: Card[]) {
  const amountMatches = [...text.matchAll(/(?:NT\$|TWD|新臺幣|新台幣|金額|消費)\s*[:：]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
  const looseAmount = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const amountText = amountMatches[0]?.[1] ?? looseAmount?.[1] ?? "";
  const last4 = text.match(/(?:末四碼|末4碼|尾號|卡號)\s*[:：]?\s*[xX＊*•·-]*\s*(\d{4})/)?.[1];
  const matchedCard = last4 ? cards.find((card) => card.last4 === last4) : undefined;
  const dateMatch = text.match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/) ?? text.match(/(\d{1,2})[\/-](\d{1,2})/);
  let date = today();
  if (dateMatch?.length === 4) date = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
  if (dateMatch?.length === 3) date = `${new Date().getFullYear()}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`;
  const merchantMatch = text.match(/(?:商店|商家|店家|特店)\s*[:：]\s*([^\n，,。]+)/);
  return { amount: Number(amountText.replaceAll(",", "")) || 0, cardId: matchedCard?.id ?? "", date, merchant: merchantMatch?.[1]?.trim() ?? "" };
}

export default function Home() {
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [noticeText, setNoticeText] = useState("");
  const [expenseSeed, setExpenseSeed] = useState<Partial<Transaction>>({});
  const [theme, setTheme] = useState<Theme>("mist");
  const [themeOpen, setThemeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getAll<Card>("cards"), getAll<Transaction>("transactions")])
      .then(([storedCards, storedTransactions]) => {
        setCards(storedCards);
        setTransactions(storedTransactions.sort((a, b) => b.date.localeCompare(a.date)));
      })
      .finally(() => setReady(true));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => undefined);
    }
    const storedTheme = localStorage.getItem("hanami-theme") as Theme | null;
    if (storedTheme && themes.some((item) => item.id === storedTheme)) setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hanami-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.date.startsWith(month)),
    [transactions, month],
  );
  const totalSpent = monthTransactions.reduce((sum, item) => sum + item.amount, 0);
  const totalLimit = cards.reduce((sum, card) => sum + card.limit, 0);
  const remaining = Math.max(totalLimit - totalSpent, 0);
  const usage = totalLimit ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;
  const byCategory = categories.map((name) => ({
    name,
    value: monthTransactions.filter((item) => item.category === name).reduce((sum, item) => sum + item.amount, 0),
  })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

  const flash = (message: string) => setToast(message);

  async function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const card: Card = {
      id: uid(), bank: String(form.get("bank") ?? "").trim(), name: String(form.get("name") ?? "").trim(),
      last4: String(form.get("last4") ?? "").trim(), limit: Number(form.get("limit")),
      closingDay: Number(form.get("closingDay")), dueDay: Number(form.get("dueDay")),
      color: cardColors[cards.length % cardColors.length], createdAt: new Date().toISOString(),
    };
    await putItem("cards", card);
    setCards((items) => [...items, card]);
    setModal(null); flash("信用卡已加入");
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const transaction: Transaction = {
      id: uid(), cardId: String(form.get("cardId")), amount: Number(form.get("amount")),
      merchant: String(form.get("merchant") ?? "").trim(), category: String(form.get("category")),
      date: String(form.get("date")), note: String(form.get("note") ?? "").trim(), createdAt: new Date().toISOString(),
    };
    await putItem("transactions", transaction);
    setTransactions((items) => [transaction, ...items].sort((a, b) => b.date.localeCompare(a.date)));
    setExpenseSeed({}); setModal(null); flash("消費已記錄");
  }

  async function removeTransaction(id: string) {
    await deleteItem("transactions", id);
    setTransactions((items) => items.filter((item) => item.id !== id));
    flash("紀錄已刪除");
  }

  async function removeCard(id: string) {
    if (transactions.some((item) => item.cardId === id)) {
      flash("這張卡仍有消費紀錄，暫時不能刪除"); return;
    }
    await deleteItem("cards", id);
    setCards((items) => items.filter((item) => item.id !== id));
    flash("信用卡已刪除");
  }

  function useNotification() {
    const parsed = parseNotification(noticeText, cards);
    if (!parsed.amount) { flash("找不到消費金額，請確認文字內容"); return; }
    setExpenseSeed(parsed); setModal("expense");
  }

  function exportJson() {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cards, transactions }, null, 2);
    downloadFile(payload, `花見備份-${today()}.json`, "application/json");
    flash("備份檔已建立，請存到「檔案」");
  }

  function exportCsv() {
    const rows = [["日期", "商家", "分類", "金額", "信用卡", "備註"], ...transactions.map((item) => {
      const card = cards.find((candidate) => candidate.id === item.cardId);
      return [item.date, item.merchant, item.category, item.amount, card ? `${card.bank} ${card.name} ${card.last4}` : "", item.note];
    })];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadFile(csv, `花見消費-${today()}.csv`, "text/csv;charset=utf-8");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!Array.isArray(raw.cards) || !Array.isArray(raw.transactions)) throw new Error("invalid");
      await replaceAll({ cards: raw.cards, transactions: raw.transactions });
      setCards(raw.cards); setTransactions(raw.transactions.sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date)));
      setModal(null); flash("備份已成功還原");
    } catch { flash("這不是有效的花見備份檔"); }
    event.target.value = "";
  }

  function downloadFile(content: string, filename: string, type: string) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  if (!ready) return <main className="loading"><span className="loader" /><p>正在整理你的帳本…</p></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">花</span><span>花見</span></div>
        <div className="top-actions">
          <div className="theme-control">
            <button className="theme-button" onClick={() => setThemeOpen((open) => !open)} aria-label="選擇介面配色" aria-expanded={themeOpen}>
              <span className="theme-button-dot" /> 配色
            </button>
            {themeOpen && <div className="theme-menu" role="menu" aria-label="介面配色">
              <div className="theme-menu-title">選擇喜歡的藍</div>
              {themes.map((item) => <button
                key={item.id}
                className={`theme-option${theme === item.id ? " active" : ""}`}
                onClick={() => { setTheme(item.id); setThemeOpen(false); }}
                role="menuitemradio"
                aria-checked={theme === item.id}
              >
                <span className="theme-swatches">{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                <span className="theme-check">{theme === item.id ? "✓" : ""}</span>
              </button>)}
            </div>}
          </div>
          <button className="icon-button" onClick={() => setModal("backup")} aria-label="備份與還原">↥</button>
          <button className="avatar" aria-label="本機帳本">本機</button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="summary-card">
          <div className="section-kicker-row">
            <span className="eyebrow">本月信用卡花費</span>
            <input className="month-picker" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="選擇月份" />
          </div>
          <div className="big-number">{money(totalSpent)}</div>
          <div className="summary-meta">
            <span>共 {monthTransactions.length} 筆消費</span>
            <span className="local-pill"><i /> 僅儲存在這台裝置</span>
          </div>
          <div className="limit-track"><span style={{ width: `${usage}%` }} /></div>
          <div className="limit-copy"><span>額度使用 {usage.toFixed(0)}%</span><span>總額度 {money(totalLimit)}</span></div>
        </div>

        <div className="remaining-card">
          <span className="eyebrow">目前剩餘額度</span>
          <strong>{money(remaining)}</strong>
          <p>{cards.length ? `分布於 ${cards.length} 張信用卡` : "先加入信用卡，即可開始追蹤"}</p>
          <button className="text-button" onClick={() => setModal("card")}>管理信用卡 <span>→</span></button>
        </div>
      </section>

      <section className="quick-section">
        <div><span className="eyebrow">快速記一筆</span><h1>今天花在哪裡？</h1></div>
        <div className="quick-actions">
          <button className="primary-action" onClick={() => cards.length ? setModal("expense") : setModal("card")}><span>＋</span> 手動新增</button>
          <button className="secondary-action" onClick={() => setModal("paste")}><span>▤</span> 貼上通知</button>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel cards-panel">
          <div className="panel-heading"><div><span className="eyebrow">我的卡片</span><h2>額度一目了然</h2></div><button className="circle-add" onClick={() => setModal("card")} aria-label="新增信用卡">＋</button></div>
          {cards.length === 0 ? (
            <button className="empty-card" onClick={() => setModal("card")}><span>＋</span><strong>加入第一張信用卡</strong><small>只需暱稱、額度與結帳日</small></button>
          ) : <div className="card-stack">{cards.map((card) => {
            const spent = monthTransactions.filter((item) => item.cardId === card.id).reduce((sum, item) => sum + item.amount, 0);
            const percent = Math.min((spent / card.limit) * 100, 100);
            return <article className="credit-row" key={card.id}>
              <div className="card-swatch" style={{ background: card.color }}><span>{card.bank.slice(0, 1)}</span></div>
              <div className="credit-info"><strong>{card.name}</strong><span>{card.bank} · •••• {card.last4 || "未填"}</span><div className="mini-track"><i style={{ width: `${percent}%`, background: card.color }} /></div></div>
              <div className="credit-numbers"><strong>{money(spent)}</strong><span>剩餘 {money(Math.max(card.limit - spent, 0))}</span></div>
            </article>;
          })}</div>}
        </div>

        <div className="panel category-panel">
          <div className="panel-heading"><div><span className="eyebrow">花費分布</span><h2>本月分類</h2></div></div>
          {byCategory.length === 0 ? <div className="empty-chart"><span>○</span><p>有消費後，就能看見分類占比</p></div> : (
            <div className="category-list">{byCategory.slice(0, 5).map((item, index) => <div className="category-row" key={item.name}>
              <span className={`category-dot dot-${index}`} /><strong>{item.name}</strong><div className="category-bar"><i style={{ width: `${(item.value / totalSpent) * 100}%` }} /></div><span>{money(item.value)}</span>
            </div>)}</div>
          )}
        </div>
      </section>

      <section className="transactions-section">
        <div className="panel-heading"><div><span className="eyebrow">近期明細</span><h2>{month.replace("-", " 年 ")} 月</h2></div><span className="record-count">{monthTransactions.length} 筆</span></div>
        {monthTransactions.length === 0 ? <div className="empty-transactions"><span>收</span><strong>這個月還沒有消費紀錄</strong><p>從手動新增或貼上銀行通知開始。</p></div> : (
          <div className="transaction-list">{monthTransactions.map((item) => {
            const card = cards.find((candidate) => candidate.id === item.cardId);
            return <article className="transaction-row" key={item.id}>
              <div className="category-icon">{item.category.slice(0, 1)}</div>
              <div className="transaction-main"><strong>{item.merchant || "未命名消費"}</strong><span>{item.date} · {item.category}{card ? ` · ${card.name}` : ""}</span></div>
              <strong className="transaction-amount">− {money(item.amount)}</strong>
              <button className="delete-button" onClick={() => removeTransaction(item.id)} aria-label={`刪除 ${item.merchant} 消費`}>×</button>
            </article>;
          })}</div>
        )}
      </section>

      <footer><p>花見不會上傳你的消費資料</p><span>資料保存在此瀏覽器 · 請定期備份</span></footer>

      {modal && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
        <section className="modal" role="dialog" aria-modal="true">
          <button className="modal-close" onClick={() => setModal(null)} aria-label="關閉">×</button>
          {modal === "expense" && <ExpenseForm cards={cards} seed={expenseSeed} onSubmit={addExpense} />}
          {modal === "card" && <CardManager cards={cards} onSubmit={addCard} onDelete={removeCard} />}
          {modal === "paste" && <div><span className="eyebrow">通知轉記帳</span><h2>貼上消費通知</h2><p className="modal-intro">文字只會在這台裝置解析，不會被上傳。</p><textarea className="notice-area" value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="例如：您的信用卡末四碼 1234 於全聯消費 NT$850…" autoFocus /><button className="submit-button" onClick={useNotification}>解析並確認</button></div>}
          {modal === "backup" && <div><span className="eyebrow">資料安全</span><h2>備份與帶走資料</h2><p className="modal-intro">建議每月備份一次，並在 iPhone 下載後選擇「儲存到檔案」放入 iCloud Drive。</p><div className="backup-options"><button onClick={exportJson}><span>備</span><div><strong>建立完整備份</strong><small>可用來還原卡片與消費資料</small></div>→</button><button onClick={exportCsv}><span>表</span><div><strong>匯出 CSV 明細</strong><small>可用 Numbers 或 Excel 開啟</small></div>→</button><button onClick={() => fileRef.current?.click()}><span>還</span><div><strong>從備份檔還原</strong><small>將取代目前這台裝置的資料</small></div>→</button></div><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importBackup} /></div>}
        </section>
      </div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function ExpenseForm({ cards, seed, onSubmit }: { cards: Card[]; seed: Partial<Transaction>; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit}><span className="eyebrow">新增消費</span><h2>記下一筆花費</h2><div className="amount-field"><span>NT$</span><input name="amount" type="number" min="1" step="1" defaultValue={seed.amount || ""} placeholder="0" required autoFocus /></div><div className="form-grid"><label>商家名稱<input name="merchant" defaultValue={seed.merchant || ""} placeholder="例如：全聯" required /></label><label>消費日期<input name="date" type="date" defaultValue={seed.date || today()} required /></label><label>信用卡<select name="cardId" defaultValue={seed.cardId || cards[0]?.id} required>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.last4 || card.bank}</option>)}</select></label><label>分類<select name="category" defaultValue="餐飲">{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="wide">備註（選填）<input name="note" placeholder="分期、共同支出等" /></label></div><button className="submit-button" type="submit">儲存這筆消費</button></form>;
}

function CardManager({ cards, onSubmit, onDelete }: { cards: Card[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void }) {
  return <div><span className="eyebrow">信用卡設定</span><h2>管理我的卡片</h2>{cards.length > 0 && <div className="manage-list">{cards.map((card) => <div key={card.id}><i style={{ background: card.color }} /><span><strong>{card.name}</strong><small>{card.bank} · 額度 {money(card.limit)}</small></span><button onClick={() => onDelete(card.id)} aria-label={`刪除 ${card.name}`}>刪除</button></div>)}</div>}<form onSubmit={onSubmit} className="card-form"><h3>加入新卡</h3><div className="form-grid"><label>銀行<input name="bank" placeholder="例如：國泰世華" required /></label><label>卡片暱稱<input name="name" placeholder="例如：日常卡" required /></label><label>卡號末四碼<input name="last4" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" /></label><label>信用額度<input name="limit" type="number" min="1" inputMode="numeric" placeholder="50000" required /></label><label>結帳日<input name="closingDay" type="number" min="1" max="31" placeholder="15" required /></label><label>繳款截止日<input name="dueDay" type="number" min="1" max="31" placeholder="30" required /></label></div><button className="submit-button" type="submit">加入信用卡</button></form></div>;
}
