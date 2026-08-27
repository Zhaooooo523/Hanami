export type ShortcutEntry = {
  amount?: number;
  merchant?: string;
  last4?: string;
  category?: string;
  date?: string;
  paymentMethod?: string;
  installmentCount?: number;
  rewardDeduction?: number;
  autoSave: boolean;
};

const parameterNames = {
  amount: ["amount", "金額"],
  merchant: ["merchant", "商家"],
  last4: ["last4", "card", "卡片末四碼"],
  category: ["category", "分類"],
  date: ["date", "日期"],
  paymentMethod: ["paymentMethod", "payment", "付款管道", "付款方式"],
  installmentCount: ["installmentCount", "installments", "分期期數", "分期"],
  rewardDeduction: ["rewardDeduction", "reward", "回饋扣點", "回饋折抵"],
  autoSave: ["save", "autoSave", "自動儲存"],
} as const;

function firstValue(params: URLSearchParams, names: readonly string[]) {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null) return value.trim();
  }
  return undefined;
}

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
}

export function parseShortcutHash(hash: string): ShortcutEntry | null {
  const raw = hash.replace(/^#\??/, "");
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  const hasShortcutParameter = Object.entries(parameterNames)
    .some(([key, names]) => key !== "autoSave" && names.some((name) => params.has(name)));
  if (!hasShortcutParameter) return null;

  const amountText = firstValue(params, parameterNames.amount)?.replaceAll(",", "");
  const amount = amountText ? Number(amountText) : undefined;
  const merchant = firstValue(params, parameterNames.merchant);
  const last4Text = firstValue(params, parameterNames.last4);
  const category = firstValue(params, parameterNames.category);
  const dateText = firstValue(params, parameterNames.date);
  const paymentMethod = firstValue(params, parameterNames.paymentMethod);
  const installmentText = firstValue(params, parameterNames.installmentCount);
  const installmentCount = installmentText ? Number(installmentText) : undefined;
  const rewardText = firstValue(params, parameterNames.rewardDeduction)?.replaceAll(",", "");
  const rewardDeduction = rewardText ? Number(rewardText) : undefined;
  const autoSaveText = firstValue(params, parameterNames.autoSave)?.toLowerCase();

  return {
    amount: amount && Number.isFinite(amount) && amount > 0 ? amount : undefined,
    merchant: merchant || undefined,
    last4: last4Text && /^\d{4}$/.test(last4Text) ? last4Text : undefined,
    category: category || undefined,
    date: dateText && isValidDate(dateText) ? dateText : undefined,
    paymentMethod: paymentMethod || undefined,
    installmentCount: installmentCount && Number.isInteger(installmentCount) && installmentCount > 1 && installmentCount <= 60
      ? installmentCount
      : undefined,
    rewardDeduction: rewardDeduction && Number.isFinite(rewardDeduction) && rewardDeduction > 0
      ? rewardDeduction
      : undefined,
    autoSave: ["1", "true", "yes", "是"].includes(autoSaveText ?? ""),
  };
}
