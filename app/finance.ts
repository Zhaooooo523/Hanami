export type InstallmentTransaction = {
  id: string;
  amount: number;
  date: string;
  installmentCount?: number;
};

export type ExpandedInstallment<T extends InstallmentTransaction> = {
  key: string;
  transaction: T;
  date: string;
  amount: number;
  installmentNumber: number;
  installmentCount: number;
};

export const normalizedInstallmentCount = (value?: number) =>
  Number.isInteger(value) && (value ?? 0) > 1 && (value ?? 0) <= 60 ? value! : 1;

export const addMonthsToDate = (dateText: string, offset: number) => {
  const [year, monthNumber, day] = dateText.split("-").map(Number);
  const target = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};

export const installmentPaymentAmount = (total: number, count: number, index: number) => {
  const base = Math.floor(total / count);
  return base + (index < total % count ? 1 : 0);
};

export const expandInstallments = <T extends InstallmentTransaction>(transactions: T[]): ExpandedInstallment<T>[] =>
  transactions.flatMap((transaction) => {
    const count = normalizedInstallmentCount(transaction.installmentCount);
    return Array.from({ length: count }, (_, index) => ({
      key: `${transaction.id}:${index + 1}`,
      transaction,
      date: addMonthsToDate(transaction.date, index),
      amount: installmentPaymentAmount(transaction.amount, count, index),
      installmentNumber: index + 1,
      installmentCount: count,
    }));
  });

export const summarizeChargeUsage = (
  charges: { amount: number; transaction: { speciallyMarked?: boolean } }[],
  rewardTotal = 0,
) => {
  const regularAmount = charges
    .filter((item) => !item.transaction.speciallyMarked)
    .reduce((sum, item) => sum + item.amount, 0);
  const speciallyMarkedAmount = charges
    .filter((item) => item.transaction.speciallyMarked)
    .reduce((sum, item) => sum + item.amount, 0);
  return {
    regularAmount,
    speciallyMarkedAmount,
    spent: Math.max(regularAmount - rewardTotal, 0),
  };
};

const dateForDay = (month: string, day: number) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};

const previousMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const addDaysToDate = (dateText: string, offset: number) => {
  const [year, monthNumber, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, day + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

export const billingCycleForCard = (month: string, card: { closingDay: number }) => {
  const statementDate = dateForDay(month, card.closingDay);
  const previousStatementDate = dateForDay(previousMonth(month), card.closingDay);
  return {
    statementDate,
    startDate: addDaysToDate(previousStatementDate, 1),
    // 結帳日當天的消費屬於本期；下一期從隔天開始。
    endDate: statementDate,
  };
};

export const isInBillingCycle = (date: string, month: string, card: { closingDay: number }) => {
  const { startDate, endDate } = billingCycleForCard(month, card);
  return date >= startDate && date <= endDate;
};
