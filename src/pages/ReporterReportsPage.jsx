import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import MonthPickerField from "../components/MonthPickerField.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import reporterService from "../services/reporterService.js";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";
import {
  formatMonthLabel,
  getManualExpenseTotal,
  getYearLabel,
  reporterAmountFields,
  safeNumber,
  shiftMonth,
  toMonth
} from "../utils/reporterUtils.js";

const amountFields = reporterAmountFields;

function MonthlyMobileRow({ row }) {
  return (
    <div className="reporter-mobile-row rounded-xl border p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="reporter-mobile-date text-sm font-black">{row.date}</p>
        <p className="reporter-mobile-accent text-xs font-bold">
          LOR 50%: {formatCurrency(row.lorHalfPaidAmount)}
        </p>
      </div>
      <div className="reporter-mobile-grid grid grid-cols-2 gap-2 text-xs font-semibold">
        <span>LOR soni: {row.lorClientsCount}</span>
        <span>Protsedura: {row.procedureCount}</span>
        <span>LOR: {formatCurrency(row.lorPaidAmount)}</span>
        <span>Proc: {formatCurrency(row.procedurePaidAmount)}</span>
        <span>Jami: {formatCurrency(row.autoIncomeTotal)}</span>
        <span>Harajat jami: {formatCurrency(row.manualExpenseTotal)}</span>
        <span>Terminal: {formatCurrency(row.terminalAmount)}</span>
        <span>Click: {formatCurrency(row.clickAmount)}</span>
        <span>Perech: {formatCurrency(row.transferAmount)}</span>
        <span>Qarz: {formatCurrency(row.debtAmount)}</span>
      </div>
    </div>
  );
}

function ReportDownloadPanel({
  month,
  monthlyReport,
  exportingReportId,
  onMonthChange,
  onExport
}) {
  const currentMonth = toMonth();
  const previousYearMonth = shiftMonth(currentMonth, -12);
  const selectedYear = getYearLabel(month);
  const selectedTotal =
    safeNumber(monthlyReport?.totals?.lorHalfPaidAmount) +
    safeNumber(monthlyReport?.totals?.procedurePaidAmount);
  const isExporting = Boolean(exportingReportId);

  return (
    <section className="reporter-download-card card space-y-4 p-3 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Excel hisobot</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Oylar Excel ichida alohida sahifalarda chiqadi.
          </p>
        </div>
        <div className="reporter-report-total rounded-xl border px-4 py-3 text-sm font-bold">
          {formatMonthLabel(month)} jami: {formatCurrency(selectedTotal)} so'm
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[16rem_1fr] xl:items-end">
        <MonthPickerField label="Hisobot yili" value={month} onChange={onMonthChange} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            className="min-h-12 w-full"
            variant="accent"
            loading={exportingReportId === "current"}
            loadingText="Yuklanmoqda..."
            disabled={isExporting}
            onClick={() => onExport(currentMonth, "current")}
          >
            Shu yil Excel
          </Button>
          <Button
            className="min-h-12 w-full"
            variant="secondary"
            loading={exportingReportId === "previous"}
            loadingText="Yuklanmoqda..."
            disabled={isExporting}
            onClick={() => onExport(previousYearMonth, "previous")}
          >
            O'tgan yil Excel
          </Button>
          <Button
            className="min-h-12 w-full"
            loading={exportingReportId === "selected"}
            loadingText="Yuklanmoqda..."
            disabled={isExporting}
            onClick={() => onExport(month, "selected")}
          >
            {selectedYear} Excel
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReporterReportsPage() {
  const [month, setMonth] = useState(toMonth);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [loadingMonthly, setLoadingMonthly] = useState(true);
  const [exportingReportId, setExportingReportId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadMonthly = useCallback(async () => {
    setLoadingMonthly(true);
    setError("");
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
    loadMonthly();
  }, [loadMonthly]);

  const monthlyRows = useMemo(
    () =>
      (monthlyReport?.rows || []).map((row) => {
        const manualAmounts = amountFields.reduce(
          (acc, field) => ({
            ...acc,
            [field.key]: row.manual?.[field.key] || 0
          }),
          {}
        );

        return {
          id: row.date,
          date: row.date,
          lorClientsCount: row.cashier?.lor?.count || 0,
          lorPaidAmount: row.cashier?.lor?.paidAmount || 0,
          lorHalfPaidAmount: row.cashier?.lor?.halfPaidAmount || 0,
          procedureCount: row.cashier?.procedure?.proceduresCount || 0,
          procedurePaidAmount: row.cashier?.procedure?.paidAmount || 0,
          autoIncomeTotal:
            safeNumber(row.cashier?.lor?.halfPaidAmount) +
            safeNumber(row.cashier?.procedure?.paidAmount),
          ...manualAmounts,
          manualExpenseTotal: getManualExpenseTotal(manualAmounts)
        };
      }),
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
          ...amountFields.map((field) => row[field.key])
        ].some((value) => safeNumber(value) > 0)
      ),
    [monthlyRows]
  );

  const handleExport = async (targetMonth = month, reportId = "selected") => {
    setMonth(targetMonth);
    setExportingReportId(reportId);
    setError("");
    setSuccess("");
    try {
      await reporterService.downloadMonthlyExcel(targetMonth);
      setSuccess(`${getYearLabel(targetMonth)} Excel hisoboti yuklandi.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setExportingReportId("");
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
      key: "autoIncomeTotal",
      label: "LOR 50% + Protsedura",
      render: (row) => `${formatCurrency(row.autoIncomeTotal)} so'm`
    },
    {
      key: "expenseAmount",
      label: "Harajat",
      render: (row) => `${formatCurrency(row.expenseAmount)} so'm`
    },
    {
      key: "medicineAmount",
      label: "Dori",
      render: (row) => `${formatCurrency(row.medicineAmount)} so'm`
    },
    {
      key: "supplyAmount",
      label: "Ta'minot",
      render: (row) => `${formatCurrency(row.supplyAmount)} so'm`
    },
    {
      key: "stationeryAmount",
      label: "Kanstovar",
      render: (row) => `${formatCurrency(row.stationeryAmount)} so'm`
    },
    {
      key: "communicationAmount",
      label: "Aloqa",
      render: (row) => `${formatCurrency(row.communicationAmount)} so'm`
    },
    {
      key: "childrenAmount",
      label: "Farzandlarga",
      render: (row) => `${formatCurrency(row.childrenAmount)} so'm`
    },
    {
      key: "homeAmount",
      label: "Uy uchun",
      render: (row) => `${formatCurrency(row.homeAmount)} so'm`
    },
    {
      key: "bossAmount",
      label: "Boshliq",
      render: (row) => `${formatCurrency(row.bossAmount)} so'm`
    },
    {
      key: "manualExpenseTotal",
      label: "Jami harajat",
      render: (row) => `${formatCurrency(row.manualExpenseTotal)} so'm`
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
    <div className="reporter-dashboard space-y-3 pb-4 sm:space-y-4">
      <div className="reporter-hero-card card p-3 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
              Reporter
            </p>
            <h1 className="mt-1 text-lg font-black leading-tight text-slate-900 sm:text-2xl">
              Yillik hisobot
            </h1>
          </div>
          <Link
            to="/reporter"
            className="sampi-btn inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-300"
          >
            Kunlik to'ldirish
          </Link>
        </div>
      </div>

      {error ? <Alert type="error" message={error} /> : null}
      {success ? <Alert type="success" message={success} /> : null}

      <ReportDownloadPanel
        month={month}
        monthlyReport={monthlyReport}
        exportingReportId={exportingReportId}
        onMonthChange={setMonth}
        onExport={handleExport}
      />

      <section className="reporter-monthly-card card p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Oylik jadval</h2>
            <p className="text-sm font-medium text-slate-500">
              {month} oyi bo'yicha Excelga tushadigan kunlik jadval.
            </p>
          </div>
          {monthlyReport?.totals ? (
            <div className="text-sm font-bold text-slate-700">
              Jami LOR 50% + Protsedura:{" "}
              {formatCurrency(
                safeNumber(monthlyReport.totals.lorHalfPaidAmount) +
                  safeNumber(monthlyReport.totals.procedurePaidAmount)
              )}{" "}
              so'm
            </div>
          ) : null}
        </div>
        {loadingMonthly ? (
          <Spinner />
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
              {activeMonthlyRows.length === 0 ? (
                <div className="reporter-empty-state rounded-xl border p-4 text-center text-sm font-semibold">
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

export default ReporterReportsPage;
