export const reporterAmountFields = [
  { key: "expenseAmount", label: "Harajat" },
  { key: "medicineAmount", label: "Dori" },
  { key: "supplyAmount", label: "Ta'minot" },
  { key: "stationeryAmount", label: "Kanstovar" },
  { key: "communicationAmount", label: "Aloqa" },
  { key: "childrenAmount", label: "Farzandlarga" },
  { key: "homeAmount", label: "Uy uchun" },
  { key: "bossAmount", label: "Boshliq summasi" },
  { key: "terminalAmount", label: "Terminal" },
  { key: "transferAmount", label: "Perechisleniya" },
  { key: "clickAmount", label: "Click" },
  { key: "debtAmount", label: "Qarz" }
];

export const reporterMonthLabels = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr"
];

export const toYmd = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toMonth = (date = new Date()) => toYmd(date).slice(0, 7);

export const shiftMonth = (value, offset) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
    : new Date();
  base.setMonth(base.getMonth() + offset);
  return toMonth(base);
};

export const formatMonthLabel = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return value || "";
  const monthIndex = Number(match[2]) - 1;
  return `${reporterMonthLabels[monthIndex] || match[2]} ${match[1]}`;
};

export const getYearLabel = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  return match ? match[1] : new Date().getFullYear();
};

export const getPreviousDateKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return toYmd(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() - 1);
  return toYmd(date);
};

export const safeNumber = (value) => {
  const parsed =
    typeof value === "number" ? value : Number(String(value || "").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeAmountInput = (value) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 12);

export const formatAmountInput = (value) => {
  const digits = normalizeAmountInput(value);
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export const isMissingAmount = (value) => String(value ?? "").trim() === "";

export const getManualExpenseTotal = (manualAmounts = {}) =>
  safeNumber(manualAmounts.expenseAmount) +
  safeNumber(manualAmounts.medicineAmount) +
  safeNumber(manualAmounts.supplyAmount) +
  safeNumber(manualAmounts.stationeryAmount) +
  safeNumber(manualAmounts.communicationAmount) +
  safeNumber(manualAmounts.childrenAmount) +
  safeNumber(manualAmounts.homeAmount) +
  safeNumber(manualAmounts.bossAmount) +
  safeNumber(manualAmounts.debtAmount);
