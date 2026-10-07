import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import PrintingOverlay from "../components/PrintingOverlay.jsx";
import cashierService from "../services/cashierService.js";
import { extractErrorMessage, formatCurrency, formatShortDateTime } from "../utils/format.js";
import { getCurrentShiftYmd } from "../utils/date.js";
import { printAccountantReport } from "../utils/printReceipt.js";

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

// "2026-10-07" -> "2026-10-06": hisobchi odatda ertalab kelib kechagi smenani oladi.
const previousYmd = (ymd) => {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
};

const sum = (value) => `${formatCurrency(value)}\u00a0so'm`;

function SummaryCard({ title, value, hint, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    doctor: "border-amber-200 bg-amber-50",
    clinic: "border-emerald-200 bg-emerald-50",
    cash: "border-sky-200 bg-sky-50"
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-black text-slate-900">{sum(value)}</p>
      {hint ? <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Line({ label, value, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={strong ? "font-bold text-slate-800" : "text-slate-600"}>{label}</span>
      <span className={`whitespace-nowrap ${strong ? "text-lg font-black text-slate-900" : "font-bold text-slate-800"}`}>
        {sum(value)}
      </span>
    </div>
  );
}

// Hisobchi har kuni keladi: qaysi doktor qancha ishladi, doktorga 50%, protsedura puli
// klinikaga, qarzlar va kassa xarajatlari bitta sahifada (chek printeriga ham chiqadi).
function CashierAccountantPage() {
  const [today] = useState(() => getCurrentShiftYmd());
  const yesterday = previousYmd(today);
  const [date, setDate] = useState(today);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (targetDate) => {
    setLoading(true);
    setError("");
    try {
      setReport(await cashierService.getAccountantReport(targetDate));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(date);
  }, [date, loadReport]);

  const handlePrint = async () => {
    if (!report || printing) return;
    setPrinting(true);
    setError("");
    try {
      const printed = await printAccountantReport(report);
      if (!printed) setError("Hisobotni printerga yuborib bo'lmadi.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPrinting(false);
    }
  };

  const percent = report?.doctorSharePercent ?? 50;
  const doctorColumns = [
    {
      key: "name",
      label: "Doktor",
      render: (row) => <span className="font-bold text-slate-900">{row.name}</span>
    },
    { key: "patients", label: "Bemorlar", render: (row) => `${row.patients} ta` },
    { key: "billed", label: "Cheklar summasi", render: (row) => sum(row.billed) },
    {
      key: "collected",
      label: "Kassaga tushdi",
      render: (row) => <span className="font-bold">{sum(row.collected)}</span>
    },
    {
      key: "doctorShare",
      label: `Doktorga ${percent}%`,
      render: (row) => <span className="font-black text-amber-700">{sum(row.doctorShare)}</span>
    },
    {
      key: "clinicShare",
      label: `Klinikaga ${100 - percent}%`,
      render: (row) => <span className="font-bold text-emerald-700">{sum(row.clinicShare)}</span>
    },
    {
      key: "debtLeft",
      label: "Qarz qoldi",
      render: (row) =>
        row.debtLeft > 0 ? <span className="font-bold text-rose-600">{sum(row.debtLeft)}</span> : "—"
    }
  ];

  return (
    <div className="space-y-5">
      <PrintingOverlay show={printing} text="Hisobot chiqarilmoqda" doneText="Hisobot tayyor" />

      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Hisobchi uchun kunlik hisobot</h1>
            <p className="mt-1 text-sm text-slate-500">
              {report?.shift
                ? `Smena: ${report.shift.fromLabel} – ${report.shift.toLabel}. `
                : ""}
              LOR tushumining {percent}% doktorga, protsedura puli to'liq klinikaga.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <DatePickerField label="Sana" value={date} onChange={setDate} />
            </div>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[
                [today, "Bugun"],
                [yesterday, "Kecha"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDate(value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
                    date === value ? "bg-primary text-white" : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => loadReport(date)}
              disabled={loading}
            >
              Yangilash
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={handlePrint}
              disabled={!report || loading || printing}
            >
              Chek chiqarish
            </Button>
          </div>
        </div>
      </div>

      <Alert type="error" message={error} />

      {loading && !report ? (
        <Spinner text="Hisobot yuklanmoqda..." />
      ) : report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Jami tushum"
              value={report.summary.totalCollected}
              hint="Smenada kassaga tushgan pul"
            />
            <SummaryCard
              title={`Doktorlarga ${percent}%`}
              value={report.summary.doctorsShare}
              hint="LOR tushumidan"
              tone="doctor"
            />
            <SummaryCard
              title="Klinikaga sof"
              value={report.summary.clinicNet}
              hint="Doktor ulushi, xarajatlar va svet/gaz/suvdan keyin"
              tone="clinic"
            />
            <SummaryCard
              title="Kassada naqd"
              value={report.summary.cashInHand}
              hint="Naqd tushum − naqd xarajat"
              tone="cash"
            />
          </div>

          <div className="card p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">LOR doktorlari</h2>
              <span className="text-xs font-semibold text-slate-500">
                {report.lor.patients} ta bemor
              </span>
            </div>
            <Table columns={doctorColumns} data={report.doctors.map((row) => ({ ...row, id: row.name }))} />
            {report.doctors.length > 1 ? (
              <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
                <span>
                  Jami tushum: <b>{sum(report.lor.collected)}</b>
                </span>
                <span className="text-amber-700">
                  Doktorlarga: <b>{sum(report.lor.doctorShare)}</b>
                </span>
                <span className="text-emerald-700">
                  Klinikaga: <b>{sum(report.lor.clinicShare)}</b>
                </span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card p-4 sm:p-5">
              <h2 className="text-base font-bold text-slate-900">Protsedura (muolaja xonasi)</h2>
              <p className="mt-0.5 text-xs text-slate-500">Puli to'liq klinikaga qoladi</p>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-slate-600">Bemorlar</span>
                  <span className="font-bold text-slate-800">{report.procedures.patients} ta</span>
                </div>
                <Line label="Cheklar summasi" value={report.procedures.billed} />
                <Line label="Qarz qoldi" value={report.procedures.debtLeft} />
                <Line label="Kassaga tushdi" value={report.procedures.collected} strong />
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <h2 className="text-base font-bold text-slate-900">To'lov turlari</h2>
              <p className="mt-0.5 text-xs text-slate-500">Smenada kassaga tushgan pul</p>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                {Object.entries(paymentMethodLabels).map(([method, label]) => (
                  <Line key={method} label={label} value={report.byPaymentMethod[method]} />
                ))}
                <Line label="Jami" value={report.summary.totalCollected} strong />
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Qarzlar</h2>
                <Link to="/cashier/debts" className="text-xs font-bold text-primary hover:underline">
                  Qarzdorlar ro'yxati →
                </Link>
              </div>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                <Line label="Bugungi bemorlardan qarz qoldi" value={report.debts.newDebt} />
                <Line label="Eski qarzdan bugun to'landi" value={report.debts.repaid} />
                <Line
                  label={`Jami qarz (${report.debts.outstandingCount} ta bemor)`}
                  value={report.debts.outstandingTotal}
                  strong
                />
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Kassa xarajatlari</h2>
                <Link to="/cashier/expenses" className="text-xs font-bold text-primary hover:underline">
                  Xarajat qo'shish →
                </Link>
              </div>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                {report.expenses.items.length ? (
                  report.expenses.items.map((item) => (
                    <div key={item.id} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 text-slate-600">
                        <span className="break-words font-semibold text-slate-800">{item.reason}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {paymentMethodLabels[item.paymentMethod] || item.paymentMethod} ·{" "}
                          {formatShortDateTime(item.createdAt)}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-bold text-slate-800">{sum(item.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-slate-500">Bu smenada xarajat yo'q</p>
                )}
                <Line label="Jami xarajat" value={report.expenses.total} strong />
              </div>
            </div>

            <div className="card p-4 sm:p-5 lg:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Svet, gaz, suv</h2>
                <span className="text-xs font-semibold text-slate-500">
                  {report.utilities?.entered
                    ? `Hisobotchi kiritgan${report.utilities.enteredBy ? `: ${report.utilities.enteredBy}` : ""}`
                    : "Hisobotchi bu kun uchun hali kiritmagan"}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {(report.utilities?.items || []).map((item) => (
                  <div key={item.key} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 whitespace-nowrap text-lg font-black text-slate-900">{sum(item.amount)}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Jami</p>
                  <p className="mt-1 whitespace-nowrap text-lg font-black text-slate-900">
                    {sum(report.utilities?.total)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default CashierAccountantPage;
