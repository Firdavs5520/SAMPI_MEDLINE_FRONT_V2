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
  computeReporterTotals,
  formatAmountInput,
  getPreviousDateKey,
  reporterFieldGroups,
  reporterInputFields,
  safeNumber,
  toYmd
} from "../utils/reporterUtils.js";

const NBSP = String.fromCharCode(160);
const SUSPICIOUS_AMOUNT_THRESHOLD = 10000000;
const SUPPLY_KEYS = ["electricityAmount", "gasAmount", "waterAmount"];
const cancelReasonLabels = {
  patient_absent: "Bemor kelmadi",
  wrong_direction: "Noto'g'ri yo'naltirilgan",
  patient_left: "Bemor qaytib ketdi",
  other: "Boshqa sabab"
};

const money = (value) => `${formatCurrency(safeNumber(value))}${NBSP}so'm`;

const emptyManual = () =>
  reporterInputFields.reduce((acc, field) => ({ ...acc, [field.key]: "" }), { note: "" });

const normalizeManualForm = (manual = {}) =>
  reporterInputFields.reduce(
    (acc, field) => {
      const value = safeNumber(manual[field.key]);
      return { ...acc, [field.key]: value > 0 ? formatAmountInput(String(value)) : "" };
    },
    { note: manual?.note || "" }
  );

// Eski yozuvda Ta'minot svet/gaz/suvga bo'linmasdan kiritilgan bo'lsa o'sha summa.
const getLegacySupply = (manual = {}) => {
  const parts = SUPPLY_KEYS.reduce((sum, key) => sum + safeNumber(manual[key]), 0);
  return parts > 0 ? 0 : safeNumber(manual.supplyAmount);
};

const getSuspiciousFields = (formValue) =>
  reporterInputFields
    .map((field) => ({ ...field, amount: safeNumber(formValue[field.key]) }))
    .filter((field) => field.amount >= SUSPICIOUS_AMOUNT_THRESHOLD);

const getSuspiciousSignature = (fields) =>
  fields.map((field) => `${field.key}:${field.amount}`).join("|");

// Avtosaqlash faqat summalar haqiqatan o'zgarganda ishlaydi (sahifani ochishning o'zi
// yozuv yaratmaydi).
const formSnapshot = (formValue) =>
  JSON.stringify([
    ...reporterInputFields.map((field) => safeNumber(formValue[field.key])),
    String(formValue.note || "")
  ]);

const shiftDateKey = (dateKey, days) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

function SaveStatus({ status }) {
  const meta = {
    idle: ["bg-slate-300", "Avtomatik saqlanadi"],
    waiting: ["bg-amber-400", "O'zgarish bor..."],
    saving: ["bg-sky-500 animate-pulse", "Saqlanmoqda..."],
    saved: ["bg-emerald-500", "Saqlandi"],
    error: ["bg-rose-500", "Saqlanmadi"],
    warning: ["bg-amber-500", "Katta summa tekshirilyapti"]
  }[status] || ["bg-slate-300", ""];

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
      <span className={`h-2 w-2 rounded-full ${meta[0]}`} aria-hidden="true" />
      {meta[1]}
    </span>
  );
}

function Kpi({ label, value, hint, accent = false }) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-2.5 ${
        accent ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate font-black text-slate-900 ${accent ? "text-xl" : "text-lg"}`}>{value}</p>
      {hint ? <p className="truncate text-xs font-semibold text-slate-500">{hint}</p> : null}
    </div>
  );
}

function AmountInput({ field, index, value, onChange, onEnter }) {
  const filled = safeNumber(value) > 0;
  return (
    <label className="group block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {field.label}
      </span>
      <span
        className={`flex items-center rounded-xl border bg-white transition focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/15 ${
          filled ? "border-slate-300" : "border-slate-200"
        }`}
      >
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          data-amount-index={index}
          aria-label={field.label}
          className={`reporter-amount-field min-w-0 flex-1 bg-transparent px-3 py-2.5 text-right text-lg outline-none placeholder:text-slate-300 ${
            filled ? "font-black text-slate-900" : "font-semibold text-slate-500"
          }`}
          value={value ?? ""}
          onChange={(event) => onChange(formatAmountInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter(index);
            }
          }}
        />
        <span className="pr-3 text-xs font-bold text-slate-400">so'm</span>
      </span>
    </label>
  );
}

function GroupCard({ group, startIndex, form, onFieldChange, onEnter, footer }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-black text-slate-900">{group.title}</h2>
        <span className="text-xs font-semibold text-slate-500">{group.hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {group.fields.map((field, offset) => (
          <AmountInput
            key={field.key}
            field={field}
            index={startIndex + offset}
            value={form[field.key]}
            onChange={(next) => onFieldChange(field.key, next)}
            onEnter={onEnter}
          />
        ))}
      </div>
      {footer}
    </section>
  );
}

function SummaryLine({ label, value, strong = false, muted = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={strong ? "font-black text-slate-900" : muted ? "text-slate-400" : "text-slate-600"}>
        {label}
      </span>
      <span
        className={`whitespace-nowrap ${
          strong ? "text-xl font-black text-slate-900" : muted ? "font-semibold text-slate-400" : "font-bold text-slate-800"
        }`}
      >
        {money(value)}
      </span>
    </div>
  );
}

function ReporterDashboard() {
  const [date, setDate] = useState(toYmd);
  const [dailyReport, setDailyReport] = useState(null);
  const [form, setForm] = useState(emptyManual);
  const [legacySupply, setLegacySupply] = useState(0);
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [suspiciousPrompt, setSuspiciousPrompt] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const savedSnapshotRef = useRef(formSnapshot(emptyManual()));
  const approvedSuspiciousSignatureRef = useRef("");
  const today = useMemo(() => toYmd(), []);

  const loadDaily = useCallback(async () => {
    setLoadingDaily(true);
    setError("");
    try {
      const data = await reporterService.getDailyReport(date);
      setDailyReport(data);
      const loadedForm = normalizeManualForm(data?.manual);
      savedSnapshotRef.current = formSnapshot(loadedForm);
      setForm(loadedForm);
      setLegacySupply(getLegacySupply(data?.manual));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingDaily(false);
    }
  }, [date]);

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  const cashier = dailyReport?.cashier || {
    lor: { count: 0, totalAmount: 0, paidAmount: 0, halfPaidAmount: 0 },
    procedure: { proceduresCount: 0, totalAmount: 0, paidAmount: 0 },
    total: { debtAmount: 0 }
  };
  const queue = { cancelReasons: [], ...(dailyReport?.lorQueue || {}) };
  const autoIncomeTotal = safeNumber(cashier.lor.halfPaidAmount) + safeNumber(cashier.procedure.paidAmount);
  const { supplyAmount, expenseAmount } = computeReporterTotals(form, legacySupply);

  const buildPayload = useCallback(
    (formValue = form) => {
      const payload = { date, note: formValue.note || "" };
      for (const field of reporterInputFields) {
        payload[field.key] = safeNumber(formValue[field.key]);
      }
      return payload;
    },
    [date, form]
  );

  const saveRecord = useCallback(
    async ({ formValue = form, manual = false, showMessage = false, skipSuspiciousCheck = false } = {}) => {
      if (manual) setSaving(true);
      setError("");

      const suspiciousFields = getSuspiciousFields(formValue);
      const suspiciousSignature = getSuspiciousSignature(suspiciousFields);
      if (
        !skipSuspiciousCheck &&
        suspiciousFields.length > 0 &&
        suspiciousSignature !== approvedSuspiciousSignatureRef.current
      ) {
        setSuspiciousPrompt({ fields: suspiciousFields, signature: suspiciousSignature, formValue, manual, showMessage });
        setAutoSaveStatus("warning");
        if (manual) setSaving(false);
        return false;
      }

      try {
        const data = await reporterService.saveDailyRecord(buildPayload(formValue));
        savedSnapshotRef.current = formSnapshot(formValue);
        setDailyReport(data);
        setLegacySupply(getLegacySupply(data?.manual));
        if (showMessage) setSuccess("Hisobot saqlandi.");
      } catch (err) {
        setError(extractErrorMessage(err));
        throw err;
      } finally {
        if (manual) setSaving(false);
      }
      return true;
    },
    [buildPayload, form]
  );

  useEffect(() => {
    if (loadingDaily) return undefined;
    if (formSnapshot(form) === savedSnapshotRef.current) return undefined;

    setAutoSaveStatus("waiting");
    const timer = window.setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const saved = await saveRecord({ showMessage: false });
        if (saved) setAutoSaveStatus("saved");
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [form, loadingDaily, saveRecord]);

  const handleSave = async (event) => {
    event?.preventDefault();
    setSuccess("");
    await saveRecord({ manual: true, showMessage: true }).catch(() => {});
  };

  // Kun almashganda saqlanmagan o'zgarish avval o'z kuniga saqlanadi, yangi kunga o'tib ketmaydi.
  const handleDateChange = async (nextDate) => {
    if (!nextDate || nextDate === date) return;
    if (formSnapshot(form) !== savedSnapshotRef.current) {
      savedSnapshotRef.current = formSnapshot(form);
      await saveRecord({ showMessage: false }).catch(() => {});
    }
    setAutoSaveStatus("idle");
    setSuccess("");
    setDate(nextDate);
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Tab o'chirilgan: Enter keyingi summaga o'tadi, oxirgisida saqlaydi.
  const focusNextAmount = (index) => {
    const next = document.querySelector(`[data-amount-index="${index + 1}"]`);
    if (next) {
      next.focus();
      next.select?.();
    } else {
      handleSave();
    }
  };

  const handleCopyYesterday = async () => {
    setCopyingYesterday(true);
    setError("");
    setSuccess("");
    try {
      const previousDate = getPreviousDateKey(date);
      const data = await reporterService.getDailyReport(previousDate);
      setForm((prev) => ({ ...normalizeManualForm(data?.manual), note: prev.note || "" }));
      setSuccess(`${previousDate.split("-").reverse().join(".")} kungi summalar qo'yildi.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCopyingYesterday(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm("Kiritilgan summalarni tozalaysizmi?")) return;
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
    }).catch(() => {});
  };

  const groupStartIndex = (groupIndex) =>
    reporterFieldGroups.slice(0, groupIndex).reduce((sum, group) => sum + group.fields.length, 0);
  const expenseGroup = reporterFieldGroups.find((group) => group.key === "expenses");
  const cancelReasonText = queue.cancelReasons?.length
    ? queue.cancelReasons.map((item) => `${cancelReasonLabels[item.reason] || item.reason}: ${item.count}`).join(" · ")
    : "";

  return (
    <div className="reporter-dashboard space-y-4 pb-28 lg:pb-4">
      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Kunlik hisobot</h1>
            <div className="mt-2">
              <SaveStatus status={autoSaveStatus} />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              aria-label="Oldingi kun"
              onClick={() => handleDateChange(shiftDateKey(date, -1))}
              className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50"
            >
              ‹
            </button>
            <div className="w-44">
              <DatePickerField label="Kun" value={date} onChange={handleDateChange} />
            </div>
            <button
              type="button"
              aria-label="Keyingi kun"
              onClick={() => handleDateChange(shiftDateKey(date, 1))}
              className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50"
            >
              ›
            </button>
            {date !== today ? (
              <button
                type="button"
                onClick={() => handleDateChange(today)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Bugun
              </button>
            ) : null}
            <Link
              to="/reporter/reports"
              className="inline-flex h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              Yillik hisobot
            </Link>
          </div>
        </div>
      </header>

      {error ? <Alert type="error" message={error} /> : null}
      {success ? <Alert type="success" message={success} /> : null}

      {loadingDaily && !dailyReport ? (
        <div className="card flex min-h-48 items-center justify-center p-6">
          <Spinner />
        </div>
      ) : (
        <>
          <section>
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Kassadan avtomatik
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Kpi label="LOR bemorlar" value={`${cashier.lor.count} ta`} hint={money(cashier.lor.paidAmount)} />
              <Kpi label="LOR 50%" value={money(cashier.lor.halfPaidAmount)} hint="Tushumning yarmi" />
              <Kpi
                label="Protsedura"
                value={`${cashier.procedure.proceduresCount} ta`}
                hint={money(cashier.procedure.paidAmount)}
              />
              <Kpi label="LOR 50% + Protsedura" value={money(autoIncomeTotal)} hint="Klinika daromadi" accent />
              <Kpi label="Kassadagi qarz" value={money(cashier.total.debtAmount)} hint="To'lanmagan qism" />
              <Kpi
                label="LOR navbat"
                value={`${queue.issuedCount || 0} ta`}
                hint={`Yakunlandi: ${queue.completedCount || 0} · bekor: ${queue.cancelledCount || 0}`}
              />
            </div>
            {cancelReasonText || queue.avgWaitMinutes ? (
              <p className="mt-2 px-1 text-xs font-semibold text-slate-500">
                O'rtacha kutish: {queue.avgWaitMinutes || 0} daq · qabul: {queue.avgServiceMinutes || 0} daq
                {cancelReasonText ? ` · ${cancelReasonText}` : ""}
              </p>
            ) : null}
          </section>

          <form className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" noValidate onSubmit={handleSave}>
            <div className="space-y-4">
              {reporterFieldGroups.map((group, groupIndex) => (
                <GroupCard
                  key={group.key}
                  group={group}
                  startIndex={groupStartIndex(groupIndex)}
                  form={form}
                  onFieldChange={setField}
                  onEnter={focusNextAmount}
                  footer={
                    group.key === "supply" ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cyan-50 px-3 py-2">
                        <span className="text-sm font-bold text-cyan-800">
                          Ta'minot = svet + gaz + suv
                          {legacySupply > 0 && SUPPLY_KEYS.every((key) => !safeNumber(form[key]))
                            ? " (eski yozuv, bo'linmagan)"
                            : ""}
                        </span>
                        <span className="text-lg font-black text-cyan-900">{money(supplyAmount)}</span>
                      </div>
                    ) : null
                  }
                />
              ))}

              <section className="card p-4 sm:p-5">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Izoh</span>
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/15"
                    placeholder="Qo'shimcha ma'lumot (ixtiyoriy)"
                    maxLength={500}
                    value={form.note || ""}
                    onChange={(event) => setField("note", event.target.value)}
                  />
                </label>
              </section>
            </div>

            <aside className="card p-4 sm:p-5 lg:sticky lg:top-24">
              <h2 className="text-base font-black text-slate-900">Hisob</h2>
              <div className="mt-2 divide-y divide-slate-100 text-sm">
                {expenseGroup.fields.slice(0, 1).map((field) => (
                  <SummaryLine key={field.key} label={field.label} value={form[field.key]} />
                ))}
                <SummaryLine label="Ta'minot" value={supplyAmount} />
                {expenseGroup.fields.slice(1).map((field) => (
                  <SummaryLine key={field.key} label={field.label} value={form[field.key]} />
                ))}
              </div>
              <div className="reporter-total-box mt-2 rounded-xl bg-slate-900 px-4 py-3 text-white">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Hamma harajat</p>
                <p className="mt-0.5 text-2xl font-black">{money(expenseAmount)}</p>
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Hamma harajatga kirmaydi</p>
              <div className="divide-y divide-slate-100 text-sm">
                {reporterFieldGroups
                  .find((group) => group.key === "payments")
                  .fields.map((field) => (
                    <SummaryLine key={field.key} label={field.label} value={form[field.key]} muted />
                  ))}
              </div>

              <div className="mt-4 hidden gap-2 lg:grid">
                <Button type="submit" className="min-h-12 text-base" loading={saving} loadingText="Saqlanmoqda...">
                  Saqlash
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-10 text-xs"
                    loading={copyingYesterday}
                    loadingText="Olinmoqda..."
                    onClick={handleCopyYesterday}
                  >
                    Kechagini olish
                  </Button>
                  <Button type="button" variant="secondary" className="min-h-10 text-xs" onClick={handleClear}>
                    Tozalash
                  </Button>
                </div>
              </div>
            </aside>

            {/* Telefonda: pastga yopishgan panel, Hamma harajat doim ko'rinadi. */}
            <div className="sticky bottom-0 z-20 -mx-1 flex items-center gap-3 rounded-t-xl border border-b-0 border-slate-200 bg-white p-3 shadow-[0_-6px_24px_rgba(15,23,42,0.12)] lg:hidden">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Hamma harajat</p>
                <p className="truncate text-lg font-black text-slate-900">{money(expenseAmount)}</p>
              </div>
              <Button type="button" variant="secondary" className="min-h-11 px-3 text-xs" onClick={handleCopyYesterday}>
                Kechagi
              </Button>
              <Button type="submit" className="min-h-11 px-5" loading={saving} loadingText="...">
                Saqlash
              </Button>
            </div>
          </form>
        </>
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
        <div className="reporter-warning-card rounded-lg border p-4">
          <p className="text-sm font-bold">Kiritilgan summa juda katta. Yana bir marta tekshiring.</p>
          <div className="mt-3 space-y-2">
            {(suspiciousPrompt?.fields || []).map((field) => (
              <div
                key={field.key}
                className="reporter-warning-row flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold"
              >
                <span>{field.label}</span>
                <span>{money(field.amount)}</span>
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
