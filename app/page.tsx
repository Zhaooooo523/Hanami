"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { parseShortcutHash } from "./shortcut-entry";

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
  paymentMethod: PaymentMethod;
  installmentCount: number;
  createdAt: string;
};

type Theme = "mist" | "sky" | "lavender";
type PaymentMethod = "實體卡／直接刷卡" | "Apple Pay" | "LINE Pay";
type AppSettings = {
  id: "preferences";
  usagePercent: number;
  remainingAmount: number;
  browserEnabled: boolean;
  theme: Theme;
};
type AppData = { cards: Card[]; transactions: Transaction[]; settings?: AppSettings };
type Modal = "expense" | "expenseDetail" | "categoryDetail" | "card" | "paste" | "backup" | "alerts" | null;
type ExpenseSeed = Partial<Transaction>;

const categories = ["餐飲", "交通", "購物", "生活", "娛樂", "醫療", "其他"];
const paymentMethods: PaymentMethod[] = ["實體卡／直接刷卡", "Apple Pay", "LINE Pay"];
const installmentOptions = [1, 3, 6, 12, 18, 24, 30];
const cardColors = ["#557da6", "#78a9c7", "#657aac", "#879fc1", "#4f8a9d"];
const themes: { id: Theme; name: string; description: string; colors: string[] }[] = [
  { id: "mist", name: "霧藍", description: "安靜柔和", colors: ["#557da6", "#dfeaf5", "#f1f6fb"] },
  { id: "sky", name: "晴空藍", description: "清爽明亮", colors: ["#3f83a6", "#d9eef7", "#f0f8fb"] },
  { id: "lavender", name: "薰衣草藍", description: "溫柔雅緻", colors: ["#6475a7", "#e3e6f4", "#f5f5fb"] },
];
const DB_NAME = "spendlight-local";
const DB_VERSION = 2;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const defaultSettings: AppSettings = {
  id: "preferences", usagePercent: 80, remainingAmount: 5000, browserEnabled: false, theme: "mist",
};

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
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
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
    const tx = db.transaction(["cards", "transactions", "settings"], "readwrite");
    const cardsStore = tx.objectStore("cards");
    const transactionsStore = tx.objectStore("transactions");
    cardsStore.clear();
    transactionsStore.clear();
    data.cards.forEach((item) => cardsStore.put(item));
    data.transactions.forEach((item) => transactionsStore.put(item));
    if (data.settings) tx.objectStore("settings").put(data.settings);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

const money = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency", currency: "TWD", maximumFractionDigits: 0,
}).format(value);

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const normalizedPaymentMethod = (value?: string): PaymentMethod => paymentMethods.includes(value as PaymentMethod)
  ? value as PaymentMethod
  : paymentMethods[0];
const normalizedInstallmentCount = (value?: number) => Number.isInteger(value) && (value ?? 0) > 1 && (value ?? 0) <= 60
  ? value!
  : 1;
const installmentLabel = (transaction: Transaction) => {
  const count = normalizedInstallmentCount(transaction.installmentCount);
  return count > 1 ? `${count} 期 · 每期約 ${money(Math.ceil(transaction.amount / count))}` : "一次付清";
};
const normalizeTransaction = (transaction: Transaction): Transaction => ({
  ...transaction,
  paymentMethod: normalizedPaymentMethod(transaction.paymentMethod),
  installmentCount: normalizedInstallmentCount(transaction.installmentCount),
});

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
  const [cardFilter, setCardFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [noticeText, setNoticeText] = useState("");
  const [expenseSeed, setExpenseSeed] = useState<ExpenseSeed>({});
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [themeOpen, setThemeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const theme = settings.theme;

  useEffect(() => {
    Promise.all([getAll<Card>("cards"), getAll<Transaction>("transactions"), getAll<AppSettings>("settings")])
      .then(([storedCards, storedTransactions, storedSettings]) => {
        setCards(storedCards);
        setTransactions(storedTransactions.map(normalizeTransaction).sort((a, b) => b.date.localeCompare(a.date)));
        if (storedSettings[0]) setSettings({ ...defaultSettings, ...storedSettings[0] });
      })
      .finally(() => setReady(true));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) putItem("settings", settings).catch(() => undefined);
  }, [ready, settings, theme]);

  useEffect(() => {
    if (!ready) return;

    const openShortcutEntry = () => {
      const shortcut = parseShortcutHash(window.location.hash);
      if (!shortcut) return;

      const matchedCards = shortcut.last4
        ? cards.filter((card) => card.last4 === shortcut.last4)
        : [];
      const matchedCard = matchedCards.length === 1 ? matchedCards[0] : undefined;
      const category = shortcut.category
        ? categories.includes(shortcut.category) ? shortcut.category : ""
        : undefined;
      const paymentMethod = shortcut.paymentMethod
        ? normalizedPaymentMethod(shortcut.paymentMethod)
        : undefined;

      setEditingTransaction(null);
      setExpenseSeed({
        amount: shortcut.amount,
        merchant: shortcut.merchant,
        cardId: shortcut.last4 ? matchedCard?.id ?? "" : undefined,
        category,
        date: shortcut.date,
        paymentMethod,
        installmentCount: shortcut.installmentCount,
      });

      // Hash 只作為一次性傳遞資料；解析後立即從網址列與瀏覽紀錄清除。
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);

      const canAutoSave = shortcut.autoSave
        && shortcut.amount
        && shortcut.merchant
        && shortcut.date
        && matchedCard
        && category;

      if (canAutoSave) {
        const transaction: Transaction = {
          id: uid(),
          cardId: matchedCard.id,
          amount: shortcut.amount!,
          merchant: shortcut.merchant!,
          category,
          date: shortcut.date!,
          note: "",
          paymentMethod: paymentMethod ?? paymentMethods[0],
          installmentCount: normalizedInstallmentCount(shortcut.installmentCount),
          createdAt: new Date().toISOString(),
        };
        putItem("transactions", transaction).then(() => {
          setTransactions((items) => [transaction, ...items].sort((a, b) => b.date.localeCompare(a.date)));
          setModal(null);
          setToast(`已自動新增 ${transaction.merchant} ${money(transaction.amount)}`);
        }).catch(() => {
          setModal("expense");
          setToast("自動儲存失敗，請確認後手動儲存");
        });
        return;
      }

      setModal("expense");
      if (shortcut.autoSave) setToast("資料不完整或無法唯一匹配卡片，請確認後手動儲存");
      else if (shortcut.last4 && !matchedCard) setToast(`找不到末四碼 ${shortcut.last4} 的卡片，請手動選擇`);
      else if (shortcut.category && !category) setToast(`「${shortcut.category}」不是有效分類，請手動選擇`);
    };

    openShortcutEntry();
    window.addEventListener("hashchange", openShortcutEntry);
    return () => window.removeEventListener("hashchange", openShortcutEntry);
  }, [cards, ready]);

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
  const cardSummaries = cards.map((card) => {
    const spent = monthTransactions.filter((item) => item.cardId === card.id).reduce((sum, item) => sum + item.amount, 0);
    const remaining = card.limit - spent;
    const percent = card.limit ? (spent / card.limit) * 100 : 0;
    return { card, spent, remaining, percent };
  });
  const activeAlerts = cardSummaries.filter(({ remaining, percent }) =>
    percent >= settings.usagePercent || remaining <= settings.remainingAmount,
  );
  const visibleTransactions = useMemo(() => monthTransactions.filter((item) =>
    (cardFilter === "all" || item.cardId === cardFilter)
    && (paymentFilter === "all" || normalizedPaymentMethod(item.paymentMethod) === paymentFilter),
  ), [cardFilter, paymentFilter, monthTransactions]);
  const visibleTotal = visibleTransactions.reduce((sum, item) => sum + item.amount, 0);
  const hasOverLimit = cardSummaries.some(({ remaining: cardRemaining }) => cardRemaining < 0);
  const byCategory = categories.map((name) => ({
    name,
    value: monthTransactions.filter((item) => item.category === name).reduce((sum, item) => sum + item.amount, 0),
  })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

  const flash = (message: string) => setToast(message);

  async function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const card: Card = {
      id: editingCard?.id ?? uid(), bank: String(form.get("bank") ?? "").trim(), name: String(form.get("name") ?? "").trim(),
      last4: String(form.get("last4") ?? "").trim(), limit: Number(form.get("limit")),
      closingDay: Number(form.get("closingDay")), dueDay: Number(form.get("dueDay")),
      color: editingCard?.color ?? cardColors[cards.length % cardColors.length], createdAt: editingCard?.createdAt ?? new Date().toISOString(),
    };
    await putItem("cards", card);
    setCards((items) => editingCard ? items.map((item) => item.id === card.id ? card : item) : [...items, card]);
    setEditingCard(null); setModal(null); flash(editingCard ? "信用卡資料已更新" : "信用卡已加入");
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const transaction: Transaction = {
      id: editingTransaction?.id ?? uid(), cardId: String(form.get("cardId")), amount: Number(form.get("amount")),
      merchant: String(form.get("merchant") ?? "").trim(), category: String(form.get("category")),
      date: String(form.get("date")), note: String(form.get("note") ?? "").trim(),
      paymentMethod: normalizedPaymentMethod(String(form.get("paymentMethod") ?? "")),
      installmentCount: normalizedInstallmentCount(Number(form.get("installmentCount"))),
      createdAt: editingTransaction?.createdAt ?? new Date().toISOString(),
    };
    await putItem("transactions", transaction);
    const nextTransactions = editingTransaction
      ? transactions.map((item) => item.id === transaction.id ? transaction : item)
      : [transaction, ...transactions];
    setTransactions(nextTransactions.sort((a, b) => b.date.localeCompare(a.date)));
    notifyForCard(transaction.cardId, nextTransactions);
    setExpenseSeed({}); setEditingTransaction(null); setModal(null);
    flash(editingTransaction ? "消費紀錄已更新" : "消費已記錄");
  }

  function editExpense(transaction: Transaction) {
    setSelectedTransaction(null); setEditingTransaction(transaction); setExpenseSeed(transaction); setModal("expense");
  }

  function viewExpense(transaction: Transaction) {
    setSelectedTransaction(transaction); setModal("expenseDetail");
  }

  function editCard(card: Card) {
    setEditingCard(card); setModal("card");
  }

  async function removeTransaction(id: string) {
    await deleteItem("transactions", id);
    setTransactions((items) => items.filter((item) => item.id !== id));
    if (selectedTransaction?.id === id) {
      setSelectedTransaction(null);
      setModal(null);
    }
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

  function notifyForCard(cardId: string, sourceTransactions = transactions) {
    if (!settings.browserEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const spent = sourceTransactions.filter((item) => item.cardId === cardId && item.date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
    const left = card.limit - spent;
    const percent = card.limit ? (spent / card.limit) * 100 : 0;
    if (percent >= settings.usagePercent || left <= settings.remainingAmount) {
      const options = {
        body: left < 0 ? `已超過額度 ${money(Math.abs(left))}` : `目前剩餘 ${money(left)}（已使用 ${percent.toFixed(0)}%）`,
        icon: `${BASE_PATH}/favicon.svg`,
      };
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => registration.showNotification(`${card.name} 額度提醒`, options)).catch(() => undefined);
      } else {
        new Notification(`${card.name} 額度提醒`, options);
      }
    }
  }

  async function saveAlertSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const wantsBrowser = form.get("browserEnabled") === "on";
    let browserEnabled = wantsBrowser;
    let permissionMessage = "";
    if (wantsBrowser && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      browserEnabled = (await Notification.requestPermission()) === "granted";
      if (!browserEnabled) permissionMessage = "未取得系統通知權限，站內提醒仍會保留";
    }
    if (wantsBrowser && typeof Notification === "undefined") {
      browserEnabled = false; permissionMessage = "此瀏覽器不支援系統通知，站內提醒仍會保留";
    }
    const next = {
      ...settings,
      usagePercent: Number(form.get("usagePercent")),
      remainingAmount: Number(form.get("remainingAmount")),
      browserEnabled,
    };
    setSettings(next); await putItem("settings", next);
    setModal(null); flash(permissionMessage || "額度提醒設定已儲存");
  }

  function useNotification() {
    const parsed = parseNotification(noticeText, cards);
    if (!parsed.amount) { flash("找不到消費金額，請確認文字內容"); return; }
    setEditingTransaction(null); setExpenseSeed(parsed); setModal("expense");
  }

  function exportJson() {
    const cardLimitSummary = cardSummaries.map(({ card, spent, remaining: cardRemaining, percent }) => ({
      cardId: card.id,
      bank: card.bank,
      name: card.name,
      last4: card.last4,
      limit: card.limit,
      spent,
      remaining: cardRemaining,
      usagePercent: Number(percent.toFixed(2)),
    }));
    const payload = JSON.stringify({
      version: 4,
      exportedAt: new Date().toISOString(),
      summaryMonth: month,
      cardLimitSummary,
      cards,
      transactions,
      settings,
    }, null, 2);
    downloadFile(payload, `花見備份-${today()}.json`, "application/json");
    flash(`完整備份已建立，包含 ${cards.length} 張卡片額度`);
  }

  function exportCsv() {
    const transactionRows: (string | number)[][] = [["日期", "商家", "分類", "金額", "信用卡", "付款管道", "分期期數", "每期約", "卡片額度", "備註"], ...transactions.map((item) => {
      const card = cards.find((candidate) => candidate.id === item.cardId);
      const count = normalizedInstallmentCount(item.installmentCount);
      return [item.date, item.merchant, item.category, item.amount, card ? `${card.bank} ${card.name} ${card.last4}` : "", normalizedPaymentMethod(item.paymentMethod), count, Math.ceil(item.amount / count), card?.limit ?? "", item.note];
    })];
    const cardRows: (string | number)[][] = [
      [],
      ["信用卡資料"],
      ["銀行", "卡片名稱", "末四碼", "信用額度", `${month} 已使用`, `${month} 剩餘額度`, "結帳日", "繳款截止日"],
      ...cardSummaries.map(({ card, spent, remaining: cardRemaining }) => [
        card.bank, card.name, card.last4, card.limit, spent, cardRemaining, card.closingDay, card.dueDay,
      ]),
    ];
    const rows = [...transactionRows, ...cardRows];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadFile(csv, `花見消費與卡片-${today()}.csv`, "text/csv;charset=utf-8");
    flash(`CSV 已匯出，包含 ${cards.length} 張卡片額度`);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!Array.isArray(raw.cards) || !Array.isArray(raw.transactions)) throw new Error("invalid");
      const restoredSettings = raw.settings ? { ...defaultSettings, ...raw.settings } : settings;
      const restoredTransactions = raw.transactions.map((item: Transaction) => normalizeTransaction(item));
      await replaceAll({ cards: raw.cards, transactions: restoredTransactions, settings: restoredSettings });
      setCards(raw.cards); setTransactions(restoredTransactions.sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date)));
      setSettings(restoredSettings);
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
                onClick={() => { setSettings((current) => ({ ...current, theme: item.id })); setThemeOpen(false); }}
                role="menuitemradio"
                aria-checked={theme === item.id}
              >
                <span className="theme-swatches">{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                <span className="theme-check">{theme === item.id ? "✓" : ""}</span>
              </button>)}
            </div>}
          </div>
          <button className={`icon-button alert-button${activeAlerts.length ? " has-alert" : ""}`} onClick={() => setModal("alerts")} aria-label={`額度提醒${activeAlerts.length ? `，目前 ${activeAlerts.length} 張卡需注意` : ""}`}>鈴{activeAlerts.length > 0 && <b>{activeAlerts.length}</b>}</button>
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

        <div className={`remaining-card${hasOverLimit ? " critical" : activeAlerts.length ? " warning" : ""}`}>
          <span className="eyebrow">目前剩餘額度</span>
          <strong>{money(remaining)}</strong>
          {activeAlerts.length > 0 && <button className="remaining-alert-banner" onClick={() => setModal("alerts")}>
            <span>{hasOverLimit ? "!" : "低"}</span>
            <strong>{hasOverLimit ? "已有卡片超過額度" : `${activeAlerts.length} 張卡片額度偏低`}</strong>
            <small>查看提醒 →</small>
          </button>}
          {cards.length ? <div className="remaining-breakdown">{cardSummaries.map(({ card, remaining: cardRemaining, percent }) => {
            const isOver = cardRemaining < 0;
            const isWarning = !isOver && (cardRemaining <= settings.remainingAmount || percent >= settings.usagePercent);
            return <div className={isOver ? "critical" : isWarning ? "warning" : ""} key={card.id}>
              <span><i style={{ background: isOver ? "#a05243" : isWarning ? "#c68135" : card.color }} />{card.name}{(isOver || isWarning) && <em>{isOver ? "已超額" : "額度偏低"}</em>}</span>
              <strong>{isOver ? `超過 ${money(Math.abs(cardRemaining))}` : `剩餘 ${money(cardRemaining)}`}</strong>
            </div>;
          })}</div> : <p>先加入信用卡，即可開始追蹤</p>}
          <button className="text-button" onClick={() => setModal("card")}>管理信用卡 <span>→</span></button>
        </div>
      </section>

      <section className="quick-section">
        <div><span className="eyebrow">快速記一筆</span><h1>今天花在哪裡？</h1></div>
        <div className="quick-actions">
          <button className="primary-action" onClick={() => { setEditingTransaction(null); setExpenseSeed({}); setModal(cards.length ? "expense" : "card"); }}><span>＋</span> 手動新增</button>
          <button className="secondary-action" onClick={() => setModal("paste")}><span>▤</span> 貼上通知</button>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel cards-panel">
          <div className="panel-heading"><div><span className="eyebrow">我的卡片</span><h2>額度一目了然</h2></div><button className="circle-add" onClick={() => setModal("card")} aria-label="新增信用卡">＋</button></div>
          {cards.length === 0 ? (
            <button className="empty-card" onClick={() => setModal("card")}><span>＋</span><strong>加入第一張信用卡</strong><small>只需暱稱、額度與結帳日</small></button>
          ) : <div className="card-stack">{cardSummaries.map(({ card, spent, remaining: cardRemaining, percent: rawPercent }) => {
            const percent = Math.min(rawPercent, 100);
            return <article className="credit-row" key={card.id}>
              <div className="card-swatch" style={{ background: card.color }}><span>{card.bank.slice(0, 1)}</span></div>
              <div className="credit-info"><strong>{card.name}</strong><span>{card.bank} · •••• {card.last4 || "未填"}</span><div className="mini-track"><i style={{ width: `${percent}%`, background: card.color }} /></div></div>
              <div className="credit-numbers"><strong>已用 {money(spent)}</strong><span className={cardRemaining < 0 ? "over-limit" : ""}>{cardRemaining < 0 ? `超過 ${money(Math.abs(cardRemaining))}` : `剩餘 ${money(cardRemaining)}`}</span></div>
              <button className="row-edit-button" onClick={() => editCard(card)} aria-label={`編輯 ${card.name}`}>編輯</button>
            </article>;
          })}</div>}
        </div>

        <div className="panel category-panel">
          <div className="panel-heading"><div><span className="eyebrow">花費分布</span><h2>本月分類</h2></div></div>
          {byCategory.length === 0 ? <div className="empty-chart"><span>○</span><p>有消費後，就能看見分類占比</p></div> : (
            <div className="category-list">{byCategory.slice(0, 5).map((item, index) => <button type="button" className="category-row" key={item.name} onClick={() => { setSelectedCategory(item.name); setModal("categoryDetail"); }} aria-label={`查看${item.name}的 ${monthTransactions.filter((transaction) => transaction.category === item.name).length} 筆消費`}>
              <span className={`category-dot dot-${index}`} /><strong>{item.name}</strong><div className="category-bar"><i style={{ width: `${(item.value / totalSpent) * 100}%` }} /></div><span>{money(item.value)}</span>
            </button>)}</div>
          )}
        </div>
      </section>

      <section className="transactions-section">
        <div className="panel-heading transactions-heading">
          <div><span className="eyebrow">近期明細</span><h2>{month.replace("-", " 年 ")} 月</h2></div>
          <div className="transaction-tools">
            <label className="card-filter">信用卡
              <select value={cardFilter} onChange={(event) => setCardFilter(event.target.value)} aria-label="篩選信用卡">
                <option value="all">全部信用卡</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.last4 || card.bank}</option>)}
              </select>
            </label>
            <label className="card-filter">付款管道
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} aria-label="篩選付款管道">
                <option value="all">全部付款管道</option>
                {paymentMethods.map((method) => <option key={method}>{method}</option>)}
              </select>
            </label>
            <span className="record-count">{visibleTransactions.length} 筆 · {money(visibleTotal)}</span>
          </div>
        </div>
        {visibleTransactions.length === 0 ? <div className="empty-transactions"><span>收</span><strong>{monthTransactions.length ? "這張卡本月沒有消費" : "這個月還沒有消費紀錄"}</strong><p>{monthTransactions.length ? "可以切換其他信用卡或查看全部紀錄。" : "從手動新增或貼上銀行通知開始。"}</p></div> : (
          <div className="transaction-list">{visibleTransactions.map((item) => {
            const card = cards.find((candidate) => candidate.id === item.cardId);
            return <article className="transaction-row" key={item.id} role="button" tabIndex={0} onClick={() => viewExpense(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); viewExpense(item); } }} aria-label={`查看 ${item.merchant || "未命名消費"} 詳情`}>
              <div className="category-icon">{item.category.slice(0, 1)}</div>
              <div className="transaction-main"><strong>{item.merchant || "未命名消費"}</strong><span>{item.date} · {item.category}{card ? ` · ${card.name}` : ""} · {normalizedPaymentMethod(item.paymentMethod)}{normalizedInstallmentCount(item.installmentCount) > 1 ? ` · ${normalizedInstallmentCount(item.installmentCount)} 期` : ""}</span></div>
              <strong className="transaction-amount">− {money(item.amount)}</strong>
              <span className="transaction-view" aria-hidden="true">查看 →</span>
              <button className="delete-button" onClick={(event) => { event.stopPropagation(); removeTransaction(item.id); }} aria-label={`刪除 ${item.merchant} 消費`}>×</button>
            </article>;
          })}</div>
        )}
      </section>

      <footer><p>花見不會上傳你的消費資料</p><span>資料保存在此瀏覽器 · 請定期備份</span></footer>

      {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setModal(null); setEditingCard(null); setEditingTransaction(null); setSelectedTransaction(null); setSelectedCategory(null); } }}>
        <section className="modal" role="dialog" aria-modal="true">
          <button className="modal-close" onClick={() => { setModal(null); setEditingCard(null); setEditingTransaction(null); setSelectedTransaction(null); setSelectedCategory(null); }} aria-label="關閉">×</button>
          {modal === "expense" && <ExpenseForm cards={cards} seed={expenseSeed} editing={Boolean(editingTransaction)} onSubmit={saveExpense} />}
          {modal === "expenseDetail" && selectedTransaction && <ExpenseDetail transaction={selectedTransaction} card={cards.find((card) => card.id === selectedTransaction.cardId)} onEdit={() => editExpense(selectedTransaction)} />}
          {modal === "categoryDetail" && selectedCategory && <CategoryDetail category={selectedCategory} month={month} transactions={monthTransactions.filter((transaction) => transaction.category === selectedCategory)} cards={cards} onSelect={(transaction) => { setSelectedTransaction(transaction); setSelectedCategory(null); setModal("expenseDetail"); }} />}
          {modal === "card" && <CardManager cards={cards} editingCard={editingCard} onSubmit={saveCard} onEdit={editCard} onCancelEdit={() => setEditingCard(null)} onDelete={removeCard} />}
          {modal === "alerts" && <AlertSettings settings={settings} alerts={activeAlerts} onSubmit={saveAlertSettings} />}
          {modal === "paste" && <div><span className="eyebrow">通知轉記帳</span><h2>貼上消費通知</h2><p className="modal-intro">文字只會在這台裝置解析，不會被上傳。</p><textarea className="notice-area" value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="例如：您的信用卡末四碼 1234 於全聯消費 NT$850…" autoFocus /><button className="submit-button" onClick={useNotification}>解析並確認</button></div>}
          {modal === "backup" && <div><span className="eyebrow">資料安全</span><h2>備份與帶走資料</h2><p className="modal-intro">建議每月備份一次，並在 iPhone 下載後選擇「儲存到檔案」放入 iCloud Drive。</p><div className="backup-options"><button onClick={exportJson}><span>備</span><div><strong>建立完整備份</strong><small>包含卡片額度、結帳日、消費與提醒設定，可完整還原</small></div>→</button><button onClick={exportCsv}><span>表</span><div><strong>匯出 CSV 資料</strong><small>包含消費明細與每張卡片的額度資料</small></div>→</button><button onClick={() => fileRef.current?.click()}><span>還</span><div><strong>從備份檔還原</strong><small>將取代目前這台裝置的資料</small></div>→</button></div><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importBackup} /></div>}
        </section>
      </div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function ExpenseForm({ cards, seed, editing, onSubmit }: { cards: Card[]; seed: ExpenseSeed; editing: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const selectedInstallmentCount = normalizedInstallmentCount(seed.installmentCount);
  return <form onSubmit={onSubmit}><span className="eyebrow">{editing ? "編輯消費" : "新增消費"}</span><h2>{editing ? "修改這筆花費" : "記下一筆花費"}</h2><div className="amount-field"><span>NT$</span><input name="amount" type="number" min="1" step="1" defaultValue={seed.amount || ""} placeholder="刷卡總額" required autoFocus /></div><div className="form-grid"><label>商家名稱<input name="merchant" defaultValue={seed.merchant || ""} placeholder="例如：全聯" required /></label><label>消費日期<input name="date" type="date" defaultValue={seed.date || today()} required /></label><label>信用卡<select name="cardId" defaultValue={seed.cardId ?? cards[0]?.id} required>{seed.cardId === "" && <option value="" disabled>請選擇信用卡</option>}{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.last4 || card.bank}</option>)}</select></label><label>分類<select name="category" defaultValue={seed.category ?? "餐飲"} required>{seed.category === "" && <option value="" disabled>請選擇分類</option>}{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>付款管道<select name="paymentMethod" defaultValue={normalizedPaymentMethod(seed.paymentMethod)} required>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label><label>分期付款<select name="installmentCount" defaultValue={selectedInstallmentCount} required>{!installmentOptions.includes(selectedInstallmentCount) && <option value={selectedInstallmentCount}>{selectedInstallmentCount} 期</option>}{installmentOptions.map((count) => <option key={count} value={count}>{count === 1 ? "一次付清" : `${count} 期`}</option>)}</select></label><p className="form-help wide">金額請填刷卡總額；分期不會重複計入額度。</p><label className="wide">備註（選填）<input name="note" defaultValue={seed.note || ""} placeholder="共同支出、報帳等" /></label></div><button className="submit-button" type="submit">{editing ? "儲存修改" : "確認並儲存"}</button></form>;
}

function ExpenseDetail({ transaction, card, onEdit }: { transaction: Transaction; card?: Card; onEdit: () => void }) {
  return <div className="expense-detail">
    <span className="eyebrow">消費詳情</span>
    <div className="detail-hero">
      <span className="category-icon">{transaction.category.slice(0, 1)}</span>
      <div><h2>{transaction.merchant || "未命名消費"}</h2><strong>− {money(transaction.amount)}</strong></div>
    </div>
    <dl className="detail-list">
      <div><dt>消費日期</dt><dd>{transaction.date}</dd></div>
      <div><dt>信用卡</dt><dd>{card ? `${card.name} · •••• ${card.last4 || "未填"}` : "卡片資料已移除"}</dd></div>
      <div><dt>分類</dt><dd>{transaction.category}</dd></div>
      <div><dt>付款管道</dt><dd>{normalizedPaymentMethod(transaction.paymentMethod)}</dd></div>
      <div><dt>付款方式</dt><dd>{installmentLabel(transaction)}</dd></div>
      <div><dt>備註</dt><dd>{transaction.note || "沒有備註"}</dd></div>
    </dl>
    <button className="submit-button" type="button" onClick={onEdit}>編輯這筆花費</button>
  </div>;
}

function CategoryDetail({ category, month, transactions, cards, onSelect }: { category: string; month: string; transactions: Transaction[]; cards: Card[]; onSelect: (transaction: Transaction) => void }) {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  return <div className="category-detail">
    <span className="eyebrow">{month.replace("-", " 年 ")} 月分類明細</span>
    <div className="category-detail-heading"><div><h2>{category}</h2><p>{transactions.length} 筆消費</p></div><strong>{money(total)}</strong></div>
    {transactions.length === 0 ? <p className="category-detail-empty">這個月份沒有此分類的消費。</p> : <div className="category-detail-list">{transactions.map((transaction) => {
      const card = cards.find((candidate) => candidate.id === transaction.cardId);
      return <button type="button" key={transaction.id} onClick={() => onSelect(transaction)} aria-label={`查看 ${transaction.merchant} ${money(transaction.amount)} 詳情`}>
        <span className="category-detail-date">{transaction.date.slice(8, 10)}<small>日</small></span>
        <span className="category-detail-main"><strong>{transaction.merchant || "未命名消費"}</strong><small>{card?.name ?? "卡片資料已移除"} · {normalizedPaymentMethod(transaction.paymentMethod)}{normalizedInstallmentCount(transaction.installmentCount) > 1 ? ` · ${normalizedInstallmentCount(transaction.installmentCount)} 期` : ""}</small></span>
        <strong className="category-detail-amount">{money(transaction.amount)}</strong>
        <span className="category-detail-arrow" aria-hidden="true">›</span>
      </button>;
    })}</div>}
  </div>;
}

function CardManager({ cards, editingCard, onSubmit, onEdit, onCancelEdit, onDelete }: { cards: Card[]; editingCard: Card | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onEdit: (card: Card) => void; onCancelEdit: () => void; onDelete: (id: string) => void }) {
  return <div><span className="eyebrow">信用卡設定</span><h2>管理我的卡片</h2>{cards.length > 0 && <div className="manage-list">{cards.map((card) => <div key={card.id}><i style={{ background: card.color }} /><span><strong>{card.name}</strong><small>{card.bank} · 額度 {money(card.limit)}</small></span><span className="manage-actions"><button onClick={() => onEdit(card)} aria-label={`編輯 ${card.name}`}>編輯</button><button className="danger-link" onClick={() => onDelete(card.id)} aria-label={`刪除 ${card.name}`}>刪除</button></span></div>)}</div>}<form key={editingCard?.id ?? "new"} onSubmit={onSubmit} className="card-form"><div className="form-title-row"><h3>{editingCard ? "編輯信用卡" : "加入新卡"}</h3>{editingCard && <button type="button" onClick={onCancelEdit}>取消編輯</button>}</div><div className="form-grid"><label>銀行<input name="bank" defaultValue={editingCard?.bank} placeholder="例如：國泰世華" required /></label><label>卡片暱稱<input name="name" defaultValue={editingCard?.name} placeholder="例如：日常卡" required /></label><label>卡號末四碼<input name="last4" defaultValue={editingCard?.last4} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" /></label><label>信用額度<input name="limit" defaultValue={editingCard?.limit} type="number" min="1" inputMode="numeric" placeholder="50000" required /></label><label>結帳日<input name="closingDay" defaultValue={editingCard?.closingDay} type="number" min="1" max="31" placeholder="15" required /></label><label>繳款截止日<input name="dueDay" defaultValue={editingCard?.dueDay} type="number" min="1" max="31" placeholder="30" required /></label></div><button className="submit-button" type="submit">{editingCard ? "儲存信用卡修改" : "加入信用卡"}</button></form></div>;
}

function AlertSettings({ settings, alerts, onSubmit }: { settings: AppSettings; alerts: { card: Card; remaining: number; percent: number }[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div><span className="eyebrow">額度通知</span><h2>提醒設定</h2><p className="modal-intro">達到任一條件時，花見會顯示警示。系統通知需允許瀏覽器權限，並會在新增或修改消費時觸發。</p>{alerts.length > 0 && <div className="alert-list"><strong>目前需注意</strong>{alerts.map(({ card, remaining, percent }) => <div key={card.id}><span>{card.name}</span><span>{remaining < 0 ? `已超過 ${money(Math.abs(remaining))}` : `剩餘 ${money(remaining)} · 已用 ${percent.toFixed(0)}%`}</span></div>)}</div>}<form onSubmit={onSubmit}><div className="form-grid"><label>使用率達到<input name="usagePercent" type="number" min="1" max="100" defaultValue={settings.usagePercent} required /><small className="field-suffix">%</small></label><label>剩餘額度低於<input name="remainingAmount" type="number" min="0" step="100" defaultValue={settings.remainingAmount} required /><small className="field-suffix">元</small></label></div><label className="toggle-row"><input name="browserEnabled" type="checkbox" defaultChecked={settings.browserEnabled} /><span><strong>開啟系統通知</strong><small>裝置支援時，在新增或修改紀錄後通知</small></span></label><button className="submit-button" type="submit">儲存提醒設定</button></form></div>;
}
