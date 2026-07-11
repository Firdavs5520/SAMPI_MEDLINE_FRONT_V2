import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import Modal from "../components/Modal.jsx";
import Spinner from "../components/Spinner.jsx";
import reporterService from "../services/reporterService.js";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";
import {
  formatAmountInput,
  getPreviousDateKey,
  isMissingAmount,
  reporterAmountFields,
  safeNumber,
  toYmd
} from "../utils/reporterUtils.js";

const amountFields = reporterAmountFields;
const SUSPICIOUS_AMOUNT_THRESHOLD = 10000000;

const emptyManual = () =>
  amountFields.reduce(
    (acc, field) => ({
      ...acc,
      [field.key]: ""
    }),
    { note: "" }
  );

const normalizeManualForm = (manual = {}) =>
  amountFields.reduce(
    (acc, field) => {
      const value = safeNumber(manual[field.key]);
      return {
        ...acc,
        [field.key]: value > 0 ? formatAmountInput(String(value)) : ""
      };
    },
    { note: manual?.note || "" }
  );

const getSuspiciousFields = (formValue) =>
  amountFields
    .map((field) => ({
      ...field,
      amount: safeNumber(formValue[field.key])
    }))
    .filter((field) => field.amount >= SUSPICIOUS_AMOUNT_THRESHOLD);

const getSuspiciousSignature = (fields) =>
  fields.map((field) => `${field.key}:${field.amount}`).join("|");

function StatCard({ title, value, hint, tone = "cyan" }) {
  const tones = {
    cyan: "reporter-stat-cyan",
    emerald: "reporter-stat-emerald",
    amber: "reporter-stat-amber",
    orange: "reporter-stat-orange",
    slate: "reporter-stat-slate"
  };

  return (
    <div className={`reporter-stat-card rounded-xl border p-3 shadow-sm sm:p-4 ${tones[tone] || tones.slate}`}>
      <p className="reporter-stat-title text-xs font-bold uppercase">{title}</p>
      <p className="reporter-stat-value mt-1.5 break-words text-lg font-black leading-tight sm:mt-2 sm:text-xl">
        {value}
      </p>
      {hint ? <p className="reporter-stat-hint mt-1 text-xs font-semibold">{hint}</p> : null}
    </div>
  );
}

function CashierSummaryCards({ totals, lorHalfAmount, procedurePaidAmount, autoIncomeTotal }) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <StatCard
        title="LOR odam"
        value={totals.lor.count}
        hint={`${formatCurrency(totals.lor.totalAmount)} so'm jami`}
      />
      <StatCard
        title="LOR summa"
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
        title="Protsedura soni"
        value={totals.procedure.proceduresCount}
        hint={`${formatCurrency(totals.procedure.totalAmount)} so'm jami`}
        tone="slate"
      />
      <StatCard
        title="Protsedura summa"
        value={`${formatCurrency(procedurePaidAmount)} so'm`}
        hint="Kassadan kelgan protsedura summasi"
        tone="emerald"
      />
      <StatCard
        title="LOR 50% + Protsedura"
        value={`${formatCurrency(autoIncomeTotal)} so'm`}
        hint="Reporter uchun avtomatik yakun"
        tone="orange"
      />
      <StatCard
        title="LOR 50% qiymati"
        value={`${formatCurrency(lorHalfAmount)} so'm`}
        hint="Alohida nazorat summasi"
        tone="slate"
      />
      <StatCard
        title="Kassadagi qarz"
        value={`${formatCurrency(totals.total.debtAmount)} so'm`}
        hint="Kassa yozuvlaridagi qolgan qarz"
        tone="slate"
      />
    </section>
  );
}

function AmountField({ label, value, missing, onChange }) {
  return (
    <label className="block">
      <span className="reporter-field-label sampi-field-label mb-1.5 block text-sm font-semibold">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        aria-label={label}
        className={`reporter-amount-input sampi-input sampi-control min-h-14 w-full rounded-xl border px-3 py-2.5 text-base font-bold outline-none transition sm:text-lg ${
          missing ? "reporter-input-missing" : ""
        }`}
        value={value ?? ""}
        onChange={(event) => onChange(formatAmountInput(event.target.value))}
      />
      {missing ? <p className="mt-1 text-xs text-rose-600">To'ldirilmagan</p> : null}
    </label>
  );
}

function ReporterDashboard() {
  const [date, setDate] = useState(toYmd);
  const [dailyReport, setDailyReport] = useState(null);
  const [form, setForm] = useState(emptyManual);
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [showMissing, setShowMissing] = useState(false);
  const [suspiciousPrompt, setSuspiciousPrompt] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const skipAutoSaveRef = useRef(true);
  const approvedSuspiciousSignatureRef = useRef("");

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

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  const totals = dailyReport?.cashier || {
    lor: { count: 0, totalAmount: 0, paidAmount: 0, halfPaidAmount: 0 },
    procedure: { proceduresCount: 0, totalAmount: 0, paidAmount: 0 },
    total: { debtAmount: 0 }
  };
  const lorHalfAmount = safeNumber(totals.lor.halfPaidAmount);
  const procedurePaidAmount = safeNumber(totals.procedure.paidAmount);
  const autoIncomeTotal = lorHalfAmount + procedurePaidAmount;

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
    async ({
      formValue = form,
      manual = false,
      showMessage = false,
      skipSuspiciousCheck = false
    } = {}) => {
      if (manual) {
        setSaving(true);
      }
      setError("");

      const suspiciousFields = getSuspiciousFields(formValue);
      const suspiciousSignature = getSuspiciousSignature(suspiciousFields);
      if (
        !skipSuspiciousCheck &&
        suspiciousFields.length > 0 &&
        suspiciousSignature !== approvedSuspiciousSignatureRef.current
      ) {
        setSuspiciousPrompt({
          fields: suspiciousFields,
          signature: suspiciousSignature,
          formValue,
          manual,
          showMessage
        });
        setAutoSaveStatus("warning");
        if (manual) {
          setSaving(false);
        }
        return false;
      }

      try {
        const data = await reporterService.saveDailyRecord(buildPayload(formValue));
        setDailyReport(data);
        if (showMessage) {
          setSuccess("Reporter yozuvi saqlandi.");
        }
      } catch (err) {
        setError(extractErrorMessage(err));
        throw err;
      } finally {
        if (manual) {
          setSaving(false);
        }
      }
      return true;
    },
    [buildPayload, form]
  );

  useEffect(() => {
    if (loadingDaily) return undefined;

    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return undefined;
    }

    setAutoSaveStatus("waiting");
    const timer = window.setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const saved = await saveRecord({ showMessage: false });
        if (saved) {
          setAutoSaveStatus("saved");
        }
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [form, loadingDaily, saveRecord]);

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
    approvedSuspiciousSignatureRef.current = "";
    setSuccess("Summalar tozalandi.");
  };

  const handleApproveSuspicious = async () => {
    const pending = suspiciousPrompt;
    if (!pending) return;

    approvedSuspiciousSignatureRef.current = pending.signature;
    setSuspiciousPrompt(null);
    await saveRecord({
      formValue: pending.formValue,
      manual: pending.manual,
      showMessage: pending.showMessage,
      skipSuspiciousCheck: true
    });
  };

  const autoSaveLabel = {
    idle: "Auto-save tayyor",
    waiting: "Auto-save kutmoqda",
    saving: "Auto-save saqlayapti",
    saved: "Auto-save saqlandi",
    error: "Auto-save xato",
    warning: "Katta summa tekshirilyapti"
  }[autoSaveStatus];

  return (
    <div className="reporter-dashboard space-y-3 pb-24 sm:space-y-4 sm:pb-4">
      <div className="reporter-hero-card card p-3 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
              Reporter
            </p>
            <h1 className="mt-1 text-lg font-black leading-tight text-slate-900 sm:text-2xl">
              Kunlik kassa va xarajat hisoboti
            </h1>
          </div>
          <div className="grid gap-2 sm:grid-cols-[12rem_auto] md:items-end md:gap-3">
            <DatePickerField label="Kun" value={date} onChange={handleDateChange} />
            <Link
              to="/reporter/reports"
              className="sampi-btn inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-300"
            >
              Yillik hisobot
            </Link>
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
        <form className="reporter-entry-card card space-y-4 p-3 sm:p-5" noValidate onSubmit={handleSave}>
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
                disabled
              >
                Auto-save yoniq
              </Button>
              <Button type="button" variant="danger" className="min-h-11 px-3 text-xs" onClick={handleClear}>
                Tozalash
              </Button>
            </div>
          </div>
          <CashierSummaryCards
            totals={totals}
            lorHalfAmount={lorHalfAmount}
            procedurePaidAmount={procedurePaidAmount}
            autoIncomeTotal={autoIncomeTotal}
          />
          <div className="reporter-amount-grid grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
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
            <span className="reporter-field-label sampi-field-label mb-1.5 block text-sm font-semibold">
              Izoh
            </span>
            <textarea
              className="reporter-note-input sampi-input sampi-control min-h-24 w-full rounded-xl border px-3 py-2.5 text-base outline-none transition sm:text-sm"
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
          <div className="reporter-mobile-save fixed inset-x-0 bottom-0 z-30 border-t p-3 shadow-2xl backdrop-blur sm:hidden">
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
      )}

      <Modal
        open={Boolean(suspiciousPrompt)}
        title="Shubhali katta summa"
        onClose={() => {
          setSuspiciousPrompt(null);
          setAutoSaveStatus("idle");
        }}
        panelClassName="max-w-md"
        bodyClassName="space-y-4"
      >
        <div className="reporter-warning-card rounded-xl border p-4">
          <p className="text-sm font-bold">
            Kiritilgan summa juda katta. Yana bir marta tekshiring.
          </p>
          <div className="mt-3 space-y-2">
            {(suspiciousPrompt?.fields || []).map((field) => (
              <div
                key={field.key}
                className="reporter-warning-row flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold"
              >
                <span>{field.label}</span>
                <span>{formatCurrency(field.amount)} so'm</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setSuspiciousPrompt(null);
              setAutoSaveStatus("idle");
            }}
          >
            Qayta tekshiraman
          </Button>
          <Button type="button" className="min-h-11" onClick={handleApproveSuspicious}>
            To'g'ri, saqlash
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default ReporterDashboard;
