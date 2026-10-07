import { useCallback, useEffect, useState } from "react";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import MonthPickerField from "../components/MonthPickerField.jsx";
import Spinner from "../components/Spinner.jsx";
import reporterService from "../services/reporterService.js";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";
import {
  formatMonthLabel,
  getManualExpenseTotal,
  reporterAmountFields,
  safeNumber,
  toMonth
} from "../utils/reporterUtils.js";

const EXCEL_SHEETS = [
  ["Umumiy", "tushum, to'lov turlari, qarz, xarajatlar va qoldiq"],
  ["Kunlik jadval", "har bir kun bo'yicha (yillik Excel bilan bir xil)"],
  ["Mutaxassislar", "har bir doktor va hamshira: bemorlar, summa, qarz"],
  ["Xizmatlar", "qaysi xizmat necha marta va qanchaga"],
  ["Dorilar", "ishlatilgan dorilar soni va summasi"],
  ["Kassa xarajatlari", "kassadan chiqqan kutilmagan xarajatlar"],
  ["Qarzdorlar", "qarzi qolgan bemorlar, telefon bilan"],
  ["Kassa yozuvlari", "oydagi barcha to'lovlar ro'yxati"]
];

const money = (value) => `${formatCurrency(safeNumber(value))}\u00a0so'm`;

function SummaryCard({ title, value, hint, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    success: "border-emerald-200 bg-emerald-50",
    accent: "border-orange-200 bg-orange-50",
    primary: "border-cyan-200 bg-cyan-50"
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ReporterMonthlyPage() {
  const [month, setMonth] = useState(toMonth);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await reporterService.getMonthlyReport(month));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async () => {
    setDownloading(true);
    setError("");
    setSuccess("");
    try {
      await reporterService.downloadFullMonthExcel(month);
      setSuccess(`${formatMonthLabel(month)} oylik Excel hisoboti yuklandi.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const totals = report?.totals || {};
  const manualExpenses = getManualExpenseTotal(totals);

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="w-full sm:w-64">
          <MonthPickerField label="Oy" value={month} onChange={(value) => setMonth(value || toMonth())} />
        </div>
        <Button
          type="button"
          className="min-h-12 w-full px-6 text-base sm:w-auto"
          loading={downloading}
          loadingText="Tayyorlanmoqda..."
          onClick={handleDownload}
        >
          {formatMonthLabel(month)} — to'liq Excel
        </Button>
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      {loading ? (
        <Spinner text="Oylik hisobot yuklanmoqda..." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="LOR"
              value={money(totals.lorPaidAmount)}
              hint={`${safeNumber(totals.lorClientsCount)} ta bemor · 50%: ${formatCurrency(
                safeNumber(totals.lorHalfPaidAmount)
              )}`}
              tone="primary"
            />
            <SummaryCard
              title="Hamshira (protsedura)"
              value={money(totals.procedurePaidAmount)}
              hint={`${safeNumber(totals.procedureCount)} ta protsedura`}
              tone="primary"
            />
            <SummaryCard
              title="LOR 50% + hamshira"
              value={money(totals.autoIncomeTotal)}
              hint="Avtomatik daromad"
              tone="success"
            />
            <SummaryCard
              title="Hamma harajat"
              value={money(manualExpenses)}
              hint="Kunlik harajat, dori, ta'minot, kanstovar, aloqa, farzandlarga, uy uchun, qarz"
              tone="accent"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4 sm:p-5">
              <h2 className="text-base font-bold text-slate-900">Kiritilgan summalar</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {reporterAmountFields.map((field) => (
                  <div key={field.key} className="flex items-center justify-between py-2 text-sm">
                    <span className={field.computed ? "font-bold text-slate-900" : "text-slate-600"}>
                      {field.label}
                    </span>
                    <span
                      className={`whitespace-nowrap text-slate-900 ${field.computed ? "font-black" : "font-semibold"}`}
                    >
                      {money(totals[field.key])}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-4 sm:p-5">
              <h2 className="text-base font-bold text-slate-900">Excel faylda nimalar bor</h2>
              <p className="mt-1 text-sm text-slate-500">Har biri alohida varaqda:</p>
              <ol className="mt-3 space-y-2">
                {EXCEL_SHEETS.map(([name, hint], index) => (
                  <li key={name} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <span>
                      <b className="text-slate-900">{name}</b>
                      <span className="text-slate-500"> — {hint}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default ReporterMonthlyPage;
