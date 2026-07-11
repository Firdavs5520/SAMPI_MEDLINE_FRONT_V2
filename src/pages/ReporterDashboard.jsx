import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import MonthPickerField from "../components/MonthPickerField.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import reporterService from "../services/reporterService.js";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const amountFields = [
  { key: "expenseAmount", label: "Harajat" },
  { key: "supplyAmount", label: "Ta'minot" },
  { key: "medicineAmount", label: "Dori" },
  { key: "bossAmount", label: "Boshliq summasi" },
  { key: "terminalAmount", label: "Terminal" },
  { key: "transferAmount", label: "Perechisleniya" },
  { key: "clickAmount", label: "Click" },
  { key: "debtAmount", label: "Qarz" }
];

const toYmd = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toMonth = (date = new Date()) => toYmd(date).slice(0, 7);

const getPreviousDateKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return toYmd(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() - 1);
  return toYmd(date);
};

const emptyManual = () =>
  amountFields.reduce(
    (acc, field) => ({
      ...acc,
      [field.key]: ""
    }),
    { note: "" }
  );

const safeNumber = (value) => {
  const parsed =
    typeof value === "number" ? value : Number(String(value || "").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeManualForm = (manual = {}) =>
  amountFields.reduce(
    (acc, field) => {
      const value = safeNumber(manual[field.key]);
      return {
        ...acc,
        [field.key]: value > 0 ? String(value) : ""
      };
    },
    { note: manual?.note || "" }
  );

const isMissingAmount = (value) => String(value ?? "").trim() === "";

const normalizeAmountInput = (value) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 12);

function StatCard({ title, value, hint, tone = "cyan" }) {
  const tones = {
    cyan: "border-cyan-100 bg-cyan-50/80 text-cyan-800",
    emerald: "border-emerald-100 bg-emerald-50/80 text-emerald-800",
    amber: "border-amber-100 bg-amber-50/80 text-amber-800",
    slate: "border-slate-200 bg-white text-slate-800"
  };

  return (
    <div className={`rounded-xl border p-3 shadow-sm sm:p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1.5 break-words text-lg font-black leading-tight sm:mt-2 sm:text-xl">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p> : null}
    </div>
  );
}

function MonthlyMobileRow({ row }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{row.date}</p>
        <p className="text-xs font-bold text-cyan-700">LOR 50%: {formatCurrency(row.lorHalfPaidAmount)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
        <span>LOR soni: {row.lorClientsCount}</span>
        <span>Protsedura: {row.procedureCount}</span>
        <span>LOR: {formatCurrency(row.lorPaidAmount)}</span>
        <span>Proc: {formatCurrency(row.procedurePaidAmount)}</span>
        <span>Terminal: {formatCurrency(row.terminalAmount)}</span>
        <span>Click: {formatCurrency(row.clickAmount)}</span>
        <span>Perech: {formatCurrency(row.transferAmount)}</span>
        <span>Qarz: {formatCurrency(row.debtAmount)}</span>
      </div>
    </div>
  );
}

function AmountField({ label, value, missing, onChange }) {
  return (
    <label className="block">
      <span className="sampi-field-label mb-1.5 block text-sm font-semibold text-slate-600">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="0"
        className={`sampi-input sampi-control min-h-14 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-lg font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 ${
          missing ? "border-amber-400 bg-amber-50/70" : ""
        }`}
        value={value ?? ""}
        onChange={(event) => onChange(normalizeAmountInput(event.target.value))}
      />
      {missing ? <p className="mt-1 text-xs text-rose-600">To'ldirilmagan</p> : null}
    </label>
  );
}

function ReporterDashboard() {
  const [date, setDate] = useState(toYmd);
  const [month, setMonth] = useState(toMonth);
  const [dailyReport, setDailyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [form, setForm] = useState(emptyManual);
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [showMissing, setShowMissing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const skipAutoSaveRef = useRef(true);

  const loadDaily = useCallback(async () => {
    setLoadingDaily(true);
    setError("");
    try {
      const data = await reporterService.getDailyReport(date);
      setDailyReport(data);
      skipAutoSaveRef.current = true;
      setForm(normalizeManualForm(data?.manual));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingDaily(false);
    }
  }, [date]);

  const loadMonthly = useCallback(async () => {
    setLoadingMonthly(true);
    try {
      const data = await reporterService.getMonthlyReport(month);
      setMonthlyReport(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingMonthly(false);
    }
  }, [month]);

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  useEffect(() => {
    loadMonthly();
  }, [loadMonthly]);

  const totals = dailyReport?.cashier || {
    lor: { count: 0, totalAmount: 0, paidAmount: 0, halfPaidAmount: 0 },
    procedure: { proceduresCount: 0, totalAmount: 0, paidAmount: 0 },
    total: { debtAmount: 0 }
  };

  const monthlyRows = useMemo(
    () =>
      (monthlyReport?.rows || []).map((row) => ({
        id: row.date,
        date: row.date,
        lorClientsCount: row.cashier?.lor?.count || 0,
        lorPaidAmount: row.cashier?.lor?.paidAmount || 0,
        lorHalfPaidAmount: row.cashier?.lor?.halfPaidAmount || 0,
        procedureCount: row.cashier?.procedure?.proceduresCount || 0,
        procedurePaidAmount: row.cashier?.procedure?.paidAmount || 0,
        expenseAmount: row.manual?.expenseAmount || 0,
        terminalAmount: row.manual?.terminalAmount || 0,
        transferAmount: row.manual?.transferAmount || 0,
        clickAmount: row.manual?.clickAmount || 0,
        debtAmount: row.manual?.debtAmount || 0
      })),
    [monthlyReport]
  );
  const activeMonthlyRows = useMemo(
    () =>
      monthlyRows.filter((row) =>
        [
          row.lorClientsCount,
          row.lorPaidAmount,
          row.lorHalfPaidAmount,
          row.procedureCount,
          row.procedurePaidAmount,
          row.expenseAmount,
          row.terminalAmount,
          row.transferAmount,
          row.clickAmount,
          row.debtAmount
        ].some((value) => safeNumber(value) > 0)
      ),
    [monthlyRows]
  );

  const missingCount = useMemo(
    () => amountFields.filter((field) => isMissingAmount(form[field.key])).length,
    [form]
  );

  const buildPayload = useCallback(
    (formValue = form) => {
      const payload = {
        date,
        note: formValue.note || ""
      };

      for (const field of amountFields) {
        payload[field.key] = safeNumber(formValue[field.key]);
      }

      return payload;
    },
    [date, form]
  );

  const saveRecord = useCallback(
    async ({ formValue = form, manual = false, showMessage = false } = {}) => {
      if (manual) {
        setSaving(true);
      }
      setError("");

      try {
        const data = await reporterService.saveDailyRecord(buildPayload(formValue));
        setDailyReport(data);
        if (showMessage) {
          setSuccess("Reporter yozuvi saqlandi.");
        }
        await loadMonthly();
      } catch (err) {
        setError(extractErrorMessage(err));
        throw err;
      } finally {
        if (manual) {
          setSaving(false);
        }
      }
    },
    [buildPayload, form, loadMonthly]
  );

  useEffect(() => {
    if (!autoSaveEnabled || loadingDaily) return undefined;

    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return undefined;
    }

    setAutoSaveStatus("waiting");
    const timer = window.setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await saveRecord({ showMessage: false });
        setAutoSaveStatus("saved");
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, form, loadingDaily, saveRecord]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSuccess("");
    await saveRecord({ manual: true, showMessage: true });
  };

  const handleDateChange = (nextDate) => {
    skipAutoSaveRef.current = true;
    setDate(nextDate);
  };

  const handleCopyYesterday = async () => {
    setCopyingYesterday(true);
    setError("");
    setSuccess("");
    try {
      const previousDate = getPreviousDateKey(date);
      const data = await reporterService.getDailyReport(previousDate);
      const copied = normalizeManualForm(data?.manual);
      setForm((prev) => ({
        ...copied,
        note: prev.note || ""
      }));
      setSuccess(`${previousDate} sanasidagi summalar qo'yildi.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCopyingYesterday(false);
    }
  };

  const handleClear = () => {
    const confirmed = window.confirm("Kiritilgan summalarni tozalaysizmi?");
    if (!confirmed) return;
    setForm(emptyManual());
    setSuccess("Summalar tozalandi.");
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      await reporterService.downloadMonthlyExcel(month);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const autoSaveLabel = {
    idle: "Auto-save tayyor",
    waiting: "Auto-save kutmoqda",
    saving: "Auto-save saqlayapti",
    saved: "Auto-save saqlandi",
    error: "Auto-save xato"
  }[autoSaveStatus];

  const columns = [
    { key: "date", label: "Sana" },
    { key: "lorClientsCount", label: "LOR soni" },
    {
      key: "lorPaidAmount",
      label: "LOR kelgan",
      render: (row) => `${formatCurrency(row.lorPaidAmount)} so'm`
    },
    {
      key: "lorHalfPaidAmount",
      label: "LOR 50%",
      render: (row) => `${formatCurrency(row.lorHalfPaidAmount)} so'm`
    },
    { key: "procedureCount", label: "Protsedura soni" },
    {
      key: "procedurePaidAmount",
      label: "Protsedura kelgan",
      render: (row) => `${formatCurrency(row.procedurePaidAmount)} so'm`
    },
    {
      key: "expenseAmount",
      label: "Harajat",
      render: (row) => `${formatCurrency(row.expenseAmount)} so'm`
    },
    {
      key: "terminalAmount",
      label: "Terminal",
      render: (row) => `${formatCurrency(row.terminalAmount)} so'm`
    },
    {
      key: "transferAmount",
      label: "Perechisleniya",
      render: (row) => `${formatCurrency(row.transferAmount)} so'm`
    },
    {
      key: "clickAmount",
      label: "Click",
      render: (row) => `${formatCurrency(row.clickAmount)} so'm`
    },
    {
      key: "debtAmount",
      label: "Qarz",
      render: (row) => `${formatCurrency(row.debtAmount)} so'm`
    }
  ];

  return (
    <div className="space-y-3 pb-24 sm:space-y-4 sm:pb-4">
      <div className="card p-3 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
              Reporter
            </p>
            <h1 className="mt-1 text-lg font-black leading-tight text-slate-900 sm:text-2xl">
              Kunlik kassa va xarajat hisoboti
            </h1>
          </div>
          <div className="grid gap-2 md:grid-cols-[12rem_12rem_auto] md:items-end md:gap-3">
            <DatePickerField label="Kun" value={date} onChange={handleDateChange} />
            <MonthPickerField label="Oy" value={month} onChange={setMonth} />
            <Button
              className="min-h-12 w-full md:w-auto"
              variant="accent"
              loading={exporting}
              loadingText="Excel..."
              onClick={handleExport}
            >
              Excel yuklash
            </Button>
          </div>
        </div>
      </div>

      {error ? <Alert type="error" message={error} /> : null}
      {success ? <Alert type="success" message={success} /> : null}

      {loadingDaily ? (
        <div className="card flex min-h-48 items-center justify-center p-6">
          <Spinner />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
            <StatCard
              title="LOR mijozlari"
              value={totals.lor.count}
              hint={`${formatCurrency(totals.lor.totalAmount)} so'm jami`}
            />
            <StatCard
              title="LOR kelgan"
              value={`${formatCurrency(totals.lor.paidAmount)} so'm`}
              hint="Kassadan qabul qilingan summa"
              tone="emerald"
            />
            <StatCard
              title="LOR 50%"
              value={`${formatCurrency(totals.lor.halfPaidAmount)} so'm`}
              hint="Kelgan LOR summasi ikkiga bo'lingan"
              tone="amber"
            />
            <StatCard
              title="Protsedura"
              value={totals.procedure.proceduresCount}
              hint={`${formatCurrency(totals.procedure.paidAmount)} so'm kelgan`}
              tone="slate"
            />
            <StatCard
              title="Kassadagi qarz"
              value={`${formatCurrency(totals.total.debtAmount)} so'm`}
              hint="Kassa yozuvlaridagi qolgan qarz"
              tone="slate"
            />
          </section>

          <form className="card space-y-4 p-3 sm:p-5" onSubmit={handleSave}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Reporter kiritadigan summalar</h2>
                <p className="text-xs font-semibold text-slate-500">{autoSaveLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 px-3 text-xs"
                  loading={copyingYesterday}
                  loadingText="Olinmoqda..."
                  onClick={handleCopyYesterday}
                >
                  Kechagini olish
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 px-3 text-xs"
                  onClick={() => setShowMissing((prev) => !prev)}
                >
                  {showMissing ? "Yashirish" : `Bo'shlar: ${missingCount}`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 px-3 text-xs"
                  onClick={() => setAutoSaveEnabled((prev) => !prev)}
                >
                  {autoSaveEnabled ? "Auto-save ON" : "Auto-save OFF"}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="min-h-11 px-3 text-xs"
                  onClick={handleClear}
                >
                  Tozalash
                </Button>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
              {amountFields.map((field) => {
                const missing = showMissing && isMissingAmount(form[field.key]);
                return (
                  <AmountField
                    key={field.key}
                    label={field.label}
                    missing={missing}
                    value={form[field.key] ?? ""}
                    onChange={(nextValue) =>
                      setForm((prev) => ({
                        ...prev,
                        [field.key]: nextValue
                      }))
                    }
                  />
                );
              })}
            </div>
            <label className="block">
              <span className="sampi-field-label mb-1.5 block text-sm font-semibold text-slate-600">
                Izoh
              </span>
              <textarea
                className="sampi-input sampi-control min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 sm:text-sm"
                value={form.note || ""}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    note: event.target.value
                  }))
                }
              />
            </label>
            <div className="hidden justify-end sm:flex">
              <Button type="submit" className="min-h-12" loading={saving} loadingText="Saqlanmoqda...">
                Saqlash
              </Button>
            </div>
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:hidden">
              <Button
                type="submit"
                className="min-h-12 w-full text-base"
                loading={saving}
                loadingText="Saqlanmoqda..."
              >
                Saqlash
              </Button>
            </div>
          </form>
        </>
      )}

      <section className="card p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Oylik hisobot</h2>
            <p className="text-sm font-medium text-slate-500">
              {month} oyi bo'yicha Excelga tushadigan kunlik jadval.
            </p>
          </div>
          {monthlyReport?.totals ? (
            <div className="text-sm font-bold text-slate-700">
              Jami LOR 50%: {formatCurrency(monthlyReport.totals.lorHalfPaidAmount)} so'm
            </div>
          ) : null}
        </div>
        {loadingMonthly ? (
          <Spinner />
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
              {activeMonthlyRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                  Ma'lumot topilmadi
                </div>
              ) : (
                activeMonthlyRows.map((row) => <MonthlyMobileRow key={row.id} row={row} />)
              )}
            </div>
            <div className="hidden lg:block">
              <Table columns={columns} data={monthlyRows} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default ReporterDashboard;
