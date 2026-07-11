import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import Input from "../components/Input.jsx";
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

const emptyManual = () =>
  amountFields.reduce(
    (acc, field) => ({
      ...acc,
      [field.key]: ""
    }),
    { note: "" }
  );

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function StatCard({ title, value, hint, tone = "cyan" }) {
  const tones = {
    cyan: "border-cyan-100 bg-cyan-50/80 text-cyan-800",
    emerald: "border-emerald-100 bg-emerald-50/80 text-emerald-800",
    amber: "border-amber-100 bg-amber-50/80 text-amber-800",
    slate: "border-slate-200 bg-white text-slate-800"
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-black leading-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p> : null}
    </div>
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
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDaily = useCallback(async () => {
    setLoadingDaily(true);
    setError("");
    try {
      const data = await reporterService.getDailyReport(date);
      setDailyReport(data);
      setForm({
        ...emptyManual(),
        ...(data?.manual || {}),
        note: data?.manual?.note || ""
      });
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

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        date,
        note: form.note || ""
      };

      for (const field of amountFields) {
        payload[field.key] = safeNumber(form[field.key]);
      }

      const data = await reporterService.saveDailyRecord(payload);
      setDailyReport(data);
      setSuccess("Reporter yozuvi saqlandi.");
      await loadMonthly();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
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
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
              Reporter
            </p>
            <h1 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
              Kunlik kassa va xarajat hisoboti
            </h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-[12rem_12rem_auto]">
            <DatePickerField label="Kun" value={date} onChange={setDate} />
            <Input
              label="Oy"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Button
              className="self-end"
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
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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

          <form className="card space-y-4 p-4 sm:p-5" onSubmit={handleSave}>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Reporter kiritadigan summalar</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {amountFields.map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  type="number"
                  min="0"
                  step="1000"
                  value={form[field.key] ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      [field.key]: event.target.value
                    }))
                  }
                />
              ))}
            </div>
            <label className="block">
              <span className="sampi-field-label mb-1.5 block text-sm font-semibold text-slate-600">
                Izoh
              </span>
              <textarea
                className="sampi-input sampi-control min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                value={form.note || ""}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    note: event.target.value
                  }))
                }
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" loading={saving} loadingText="Saqlanmoqda...">
                Saqlash
              </Button>
            </div>
          </form>
        </>
      )}

      <section className="card p-4 sm:p-5">
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
        {loadingMonthly ? <Spinner /> : <Table columns={columns} data={monthlyRows} />}
      </section>
    </div>
  );
}

export default ReporterDashboard;
