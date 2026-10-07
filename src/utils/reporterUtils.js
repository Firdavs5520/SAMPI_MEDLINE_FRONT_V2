import { toTashkentYmd } from "./date.js";

// Hisobotchi kiritadigan summalar guruhlari. Ta'minot va Hamma harajat qo'lda
// kiritilmaydi, o'zi hisoblanadi:
//   Ta'minot = svet + gaz + suv
//   Hamma harajat = kunlik harajat + dori + ta'minot + kanstovar + aloqa + farzandlarga + uy uchun + qarz
export const reporterFieldGroups = [
  {
    key: "expenses",
    title: "Xarajatlar",
    hint: "Hammasi \"Hamma harajat\"ga qo'shiladi",
    fields: [
      { key: "dailyExpenseAmount", label: "Kunlik harajat", hint: "farrosh, kassir" },
      { key: "medicineAmount", label: "Dori" },
      { key: "stationeryAmount", label: "Kanstovar" },
      { key: "communicationAmount", label: "Aloqa" },
      { key: "childrenAmount", label: "Farzandlarga" },
      { key: "homeAmount", label: "Uy uchun" },
      { key: "debtAmount", label: "Qarz" }
    ]
  },
  {
    key: "supply",
    title: "Ta'minot",
    hint: "Svet + gaz + suv",
    fields: [
      { key: "electricityAmount", label: "Svet" },
      { key: "gasAmount", label: "Gaz" },
      { key: "waterAmount", label: "Suv" }
    ]
  },
  {
    key: "payments",
    title: "Tushum va boshqa",
    hint: "Hamma harajatga kirmaydi",
    fields: [
      { key: "terminalAmount", label: "Terminal" },
      { key: "transferAmount", label: "Perechisleniya" },
      { key: "clickAmount", label: "Click" },
      { key: "bossAmount", label: "Boshliq summasi" }
    ]
  }
];

// Qo'lda kiritiladigan maydonlar (saqlashda yuboriladi).
export const reporterInputFields = reporterFieldGroups.flatMap((group) => group.fields);

const SUPPLY_PART_KEYS = ["electricityAmount", "gasAmount", "waterAmount"];
const EXPENSE_PART_KEYS = [
  "dailyExpenseAmount",
  "medicineAmount",
  "supplyAmount",
  "stationeryAmount",
  "communicationAmount",
  "childrenAmount",
  "homeAmount",
  "debtAmount"
];

// Jadval va xulosalarda ko'rsatish tartibi (hisoblanadiganlari bilan).
export const reporterAmountFields = [
  { key: "dailyExpenseAmount", label: "Kunlik harajat" },
  { key: "medicineAmount", label: "Dori" },
  { key: "electricityAmount", label: "Svet" },
  { key: "gasAmount", label: "Gaz" },
  { key: "waterAmount", label: "Suv" },
  { key: "supplyAmount", label: "Ta'minot", computed: true },
  { key: "stationeryAmount", label: "Kanstovar" },
  { key: "communicationAmount", label: "Aloqa" },
  { key: "childrenAmount", label: "Farzandlarga" },
  { key: "homeAmount", label: "Uy uchun" },
  { key: "debtAmount", label: "Qarz" },
  { key: "expenseAmount", label: "Hamma harajat", computed: true },
  { key: "bossAmount", label: "Boshliq summasi" },
  { key: "terminalAmount", label: "Terminal" },
  { key: "transferAmount", label: "Perechisleniya" },
  { key: "clickAmount", label: "Click" }
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

export const toYmd = toTashkentYmd;

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

// legacySupply: eski yozuvda Ta'minot svet/gaz/suvga bo'linmagan bo'lsa saqlangan summa.
export const computeReporterTotals = (values = {}, legacySupply = 0) => {
  const supplyParts = SUPPLY_PART_KEYS.reduce((sum, key) => sum + safeNumber(values[key]), 0);
  const supplyAmount = supplyParts > 0 ? supplyParts : safeNumber(legacySupply);
  const expenseAmount = EXPENSE_PART_KEYS.reduce(
    (sum, key) => sum + (key === "supplyAmount" ? supplyAmount : safeNumber(values[key])),
    0
  );
  return { supplyAmount, expenseAmount };
};

// Hamma harajat (server ham xuddi shunday hisoblaydi).
export const getManualExpenseTotal = (manualAmounts = {}) =>
  safeNumber(manualAmounts.expenseAmount);
