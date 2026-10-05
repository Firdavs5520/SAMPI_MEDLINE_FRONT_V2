import { useEffect, useState } from "react";
import reportService from "../services/reportService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import { extractErrorMessage, formatCurrency, formatDateTime } from "../utils/format.js";
import { getCurrentShiftYmd } from "../utils/date.js";

const PERIOD_OPTIONS = [
  { value: "today", label: "Bugun" },
  { value: "week", label: "1 hafta" },
  { value: "month", label: "1 oy" }
];

const PERIOD_LABELS = {
  today: "bugungi",
  week: "so'nggi 1 hafta",
  month: "so'nggi 1 oy",
  all: "barcha davr"
};

const ROLE_TONES = {
  nurse: "border-cyan-200 bg-cyan-50",
  lor: "border-amber-200 bg-amber-50",
  total: "border-indigo-200 bg-indigo-50"
};

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

const departmentLabels = {
  nurse: "Hamshira",
  lor: "LOR",
  procedure: "Hamshira"
};

const getTodayString = () => getCurrentShiftYmd();

const emptyRoleStats = () => ({
  totalRevenue: 0,
  checksCount: 0,
  medicineTypesCount: 0,
  topItem: null
});

const emptyOverview = () => ({
  period: "today",
  inventoryMedicineTypes: 0,
  roles: {
    nurse: emptyRoleStats(),
    lor: emptyRoleStats()
  },
  lorIdentities: {
    lor1: { totalRevenue: 0, checksCount: 0 }
  },
  total: emptyRoleStats()
});

const emptyShiftReport = (date = getTodayString()) => ({
  date,
  shift: {
    fromLabel: "08:00",
    toLabel: "02:00"
  },
  totals: {
    totalAmount: 0,
    totalPaidAmount: 0,
    totalDebtAmount: 0,
    entriesCount: 0
  },
  byPaymentMethod: [],
  byDepartment: [],
  topSpecialists: []
});

const emptyMonitoring = () => ({
  health: {
    success: true,
    message: "",
    now: "",
    uptimeSec: 0,
    startedAt: "",
    dbState: "disconnected"
  },
  metrics: {
    errors5xxLast24h: 0,
    restartCountLast7d: 0
  },
  recentErrors: [],
  recentStartups: []
});

function StatCard({ title, value, hint = "", tone = "default", compact = false }) {
  const tones = {
    default: "manager-stat-default border-slate-200 bg-white text-slate-800",
    primary: "manager-stat-primary border-cyan-200 bg-cyan-50 text-cyan-800",
    success: "manager-stat-success border-emerald-200 bg-emerald-50 text-emerald-800",
    accent: "manager-stat-accent border-orange-200 bg-orange-50 text-orange-800",
    danger: "manager-stat-danger border-rose-200 bg-rose-50 text-rose-700"
  };

  return (
    <div className={`manager-stat-card rounded-lg border p-4 ${tones[tone]}`}>
      <span className="manager-stat-glow" aria-hidden="true" />
      <p className="text-xs font-semibold opacity-80">{title}</p>
      <p
        className={`mt-2 break-words font-bold ${compact ? "text-base leading-snug sm:text-lg" : "text-xl sm:text-2xl"}`}
      >
        {value}
      </p>
      <p className="mt-1 min-h-5 break-words text-xs opacity-80">{hint}</p>
    </div>
  );
}

function formatTopItem(topItem) {
  if (!topItem) {
    return {
      title: "Hali ma'lumot yo'q",
      subtitle: "Tanlangan davrda ishlatilgan xizmat yoki dori topilmadi."
    };
  }

  const itemTypeLabel = topItem.itemType === "service" ? "Xizmat" : "Dori";
  return {
    title: `${itemTypeLabel}: ${topItem.name}`,
    subtitle: `Miqdor: ${topItem.totalQuantity} ta`
  };
}

function RoleSummaryCard({ title, roleKey, stats = emptyRoleStats() }) {
  const tone = ROLE_TONES[roleKey] || "border-slate-200 bg-slate-50";
  const topItem = formatTopItem(stats.topItem);

  return (
    <div className={`manager-role-card manager-role-card-${roleKey} rounded-lg border p-4 ${tone}`}>
      <span className="manager-role-card-accent" aria-hidden="true" />
      <p className="text-sm font-bold text-slate-800">{title}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Daromad</p>
          <p className="whitespace-nowrap text-base font-bold text-slate-900">
            {formatCurrency(stats.totalRevenue)}{"\u00a0"}so'm
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Cheklar</p>
          <p className="text-base font-bold text-slate-900">{stats.checksCount}</p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-slate-500">Ishlatilgan dori turlari</p>
        <p className="text-sm font-semibold text-slate-900">{stats.medicineTypesCount}</p>
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/80 p-3">
        <p className="text-xs text-slate-500">Eng ko'p ishlatilgan</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-900">{topItem.title}</p>
        <p className="mt-1 text-xs text-slate-600">{topItem.subtitle}</p>
      </div>
    </div>
  );
}

const formatUptime = (seconds = 0) => {
  const safe = Number(seconds || 0);
  if (!Number.isFinite(safe) || safe <= 0) return "0 soniya";

  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);

  const parts = [];
  if (days) parts.push(`${days} kun`);
  if (hours) parts.push(`${hours} soat`);
  if (minutes) parts.push(`${minutes} daqiqa`);
  if (secs && parts.length < 3) parts.push(`${secs} soniya`);

  return parts.join(" ");
};

function ManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("today");
  const [shiftDate, setShiftDate] = useState(getTodayString());
  const [overview, setOverview] = useState(emptyOverview());
  const [shiftReport, setShiftReport] = useState(emptyShiftReport());
  const [monitoring, setMonitoring] = useState(emptyMonitoring());
  const [stockAlerts, setStockAlerts] = useState({ low: 0, out: 0 });

  const loadDashboard = async ({
    nextPeriod = period,
    nextShiftDate = shiftDate,
    initial = false
  } = {}) => {
    if (initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError("");
    try {
      const [overviewData, shiftData, monitoringData, stockList] = await Promise.all([
        reportService.getOverview(nextPeriod),
        reportService.getShiftCloseReport(nextShiftDate),
        reportService.getMonitoring(),
        reportService.getStock().catch(() => [])
      ]);
      const stockItems = Array.isArray(stockList) ? stockList : [];
      setStockAlerts({
        out: stockItems.filter((item) => Number(item.stock) <= 0).length,
        low: stockItems.filter((item) => Number(item.stock) > 0 && Number(item.stock) <= 10).length
      });

      setOverview({
        ...emptyOverview(),
        ...overviewData,
        roles: {
          nurse: { ...emptyRoleStats(), ...(overviewData?.roles?.nurse || {}) },
          lor: { ...emptyRoleStats(), ...(overviewData?.roles?.lor || {}) }
        },
        lorIdentities: {
          lor1: {
            totalRevenue: Number(overviewData?.lorIdentities?.lor1?.totalRevenue || 0),
            checksCount: Number(overviewData?.lorIdentities?.lor1?.checksCount || 0)
          }
        },
        total: { ...emptyRoleStats(), ...(overviewData?.total || {}) }
      });
      setShiftReport({
        ...emptyShiftReport(nextShiftDate || undefined),
        ...shiftData
      });
      if (shiftData?.date) {
        setShiftDate(shiftData.date);
      }
      setMonitoring({
        ...emptyMonitoring(),
        ...monitoringData
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (initial) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    // Bo'sh sana: backend joriy smena sanasini o'zi aniqlaydi (sozlamalar bo'yicha).
    loadDashboard({ nextPeriod: "today", nextShiftDate: "", initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodChange = (nextPeriod) => {
    if (nextPeriod === period) return;
    setPeriod(nextPeriod);
    loadDashboard({ nextPeriod, nextShiftDate: shiftDate });
  };

  const handleShiftDateChange = (nextDate) => {
    const safeDate = nextDate || "";
    setShiftDate(safeDate);
    loadDashboard({ nextPeriod: period, nextShiftDate: safeDate });
  };

  const safePeriod = overview.period || period;
  const periodHint = PERIOD_LABELS[safePeriod] || PERIOD_LABELS[period];
  const dbConnected = String(monitoring?.health?.dbState || "").toLowerCase() === "connected";

  if (loading) {
    return <Spinner text="Menejer statistikasi yuklanmoqda..." />;
  }

  return (
    <div className="manager-dashboard space-y-5 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="manager-period-tabs flex gap-2 overflow-x-auto pb-1">
          {PERIOD_OPTIONS.map((option) => {
            const isActive = period === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePeriodChange(option.value)}
                className={`manager-period-tab rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "border-primary bg-primary text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <Button
          variant="secondary"
          onClick={() => loadDashboard({ nextPeriod: period, nextShiftDate: shiftDate })}
          loading={refreshing}
          className="w-full sm:w-auto"
        >
          Yangilash
        </Button>
      </div>

      <Alert type="error" message={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Tushum"
          value={`${formatCurrency(overview.total.totalRevenue)}\u00a0so'm`}
          hint={`${periodHint} davr bo'yicha`}
          tone="success"
        />
        <StatCard
          title="Cheklar"
          value={overview.total.checksCount}
          hint={`${periodHint} davr bo'yicha`}
          tone="primary"
        />
        <StatCard
          title="Smena qarzi"
          value={`${formatCurrency(shiftReport?.totals?.totalDebtAmount || 0)}\u00a0so'm`}
          hint="Bugungi smenada to'lanmay qolgan"
          tone={Number(shiftReport?.totals?.totalDebtAmount || 0) > 0 ? "accent" : "default"}
        />
        <StatCard
          title="Ombor"
          value={
            stockAlerts.out || stockAlerts.low
              ? `${stockAlerts.out + stockAlerts.low} ta dori`
              : "Hammasi yetarli"
          }
          hint={
            stockAlerts.out || stockAlerts.low
              ? `Tugagan: ${stockAlerts.out} · kam qolgan: ${stockAlerts.low}`
              : `${overview.inventoryMedicineTypes} xil dori bor`
          }
          tone={stockAlerts.out ? "danger" : stockAlerts.low ? "accent" : "default"}
        />
      </div>

      <section className="card p-4 sm:p-5">
        <h2 className="text-lg font-bold text-slate-800">Bo'limlar</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <RoleSummaryCard title="Hamshira" roleKey="nurse" stats={overview.roles.nurse} />
          <RoleSummaryCard title="LOR" roleKey="lor" stats={overview.roles.lor} />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Smena yopish hisoboti</h2>
            <p className="mt-1 text-sm text-slate-500">
              Smena oralig'i: {shiftReport?.shift?.fromLabel || "08:00"} -{" "}
              {shiftReport?.shift?.toLabel || "02:00"}
            </p>
          </div>
          <div className="w-full sm:w-52">
            <DatePickerField label="Smena sanasi" value={shiftDate} onChange={handleShiftDateChange} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Smena summasi"
            value={`${formatCurrency(shiftReport?.totals?.totalAmount || 0)}\u00a0so'm`}
            hint={`Yozuvlar: ${shiftReport?.totals?.entriesCount || 0}`}
            tone="primary"
          />
          <StatCard
            title="To'langan"
            value={`${formatCurrency(shiftReport?.totals?.totalPaidAmount || 0)}\u00a0so'm`}
            hint={
              Number(shiftReport?.totals?.debtRepaymentAmount || 0) > 0
                ? `Shundan eski qarzlar: ${formatCurrency(shiftReport.totals.debtRepaymentAmount)}\u00a0so'm`
                : "Smenada kassaga tushgan to'lov"
            }
            tone="success"
          />
          <StatCard
            title="Qoldiq qarz"
            value={`${formatCurrency(shiftReport?.totals?.totalDebtAmount || 0)}\u00a0so'm`}
            hint="Smena oxirida qolgan qarz"
            tone="accent"
          />
          <StatCard
            title="Eng faol mutaxassis"
            compact
            value={shiftReport?.topSpecialists?.[0]?.specialistName || "-"}
            hint={
              shiftReport?.topSpecialists?.[0]
                ? `${formatCurrency(shiftReport.topSpecialists[0].totalAmount)}\u00a0so'm`
                : "Ma'lumot yo'q"
            }
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="manager-list-panel rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">To'lov usuli bo'yicha</p>
            <div className="mt-2 space-y-2">
              {(shiftReport?.byPaymentMethod || []).length === 0 ? (
                <p className="text-sm text-slate-500">Ma'lumot topilmadi</p>
              ) : (
                shiftReport.byPaymentMethod.map((item) => (
                  <div
                    key={item.paymentMethod}
                    className="manager-list-row flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-700">
                      {paymentMethodLabels[item.paymentMethod] || item.paymentMethod}
                    </span>
                    <span className="text-right font-semibold text-slate-900">
                      {formatCurrency(item.totalPaidAmount)} so'm
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="manager-list-panel rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Bo'lim bo'yicha</p>
            <div className="mt-2 space-y-2">
              {(shiftReport?.byDepartment || []).length === 0 ? (
                <p className="text-sm text-slate-500">Ma'lumot topilmadi</p>
              ) : (
                shiftReport.byDepartment.map((item) => (
                  <div
                    key={item.department}
                    className="manager-list-row flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-700">
                      {departmentLabels[item.department] || item.department}
                    </span>
                    <span className="text-right font-semibold text-slate-900">
                      {formatCurrency(item.totalAmount)} so'm
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <details className="card group p-4 sm:p-5" open={!dbConnected}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Texnik holat</h2>
            <p className="mt-1 text-sm text-slate-500">Server, baza va xatolar. Ochish uchun bosing.</p>
          </div>
          <div className="manager-monitor-chip">
            <span className={dbConnected ? "bg-emerald-500" : "bg-rose-500"} />
            {dbConnected ? "Tizim barqaror" : "Tekshirish kerak"}
          </div>
        </summary>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Baza holati"
            value={dbConnected ? "Ulangan" : "Uzilgan"}
            hint={dbConnected ? "Ulanish faol" : "Ulanish muammosi bo'lishi mumkin"}
            tone={dbConnected ? "success" : "danger"}
          />
          <StatCard
            title="Uptime"
            value={formatUptime(monitoring?.health?.uptimeSec || 0)}
            hint="Joriy ishga tushish vaqti"
          />
          <StatCard
            title="5xx (24 soat)"
            value={monitoring?.metrics?.errors5xxLast24h || 0}
            hint="So'nggi 24 soat server xatolari"
            tone={Number(monitoring?.metrics?.errors5xxLast24h || 0) > 0 ? "danger" : "default"}
          />
          <StatCard
            title="Restart (7 kun)"
            value={monitoring?.metrics?.restartCountLast7d || 0}
            hint="So'nggi 7 kun qayta ishga tushishlar"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="manager-list-panel rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Oxirgi xatolar</p>
            <div className="mt-2 space-y-2">
              {(monitoring?.recentErrors || []).length === 0 ? (
                <p className="text-sm text-slate-500">5xx xato topilmadi</p>
              ) : (
                monitoring.recentErrors.slice(0, 5).map((item) => (
                  <div
                    key={item._id}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                  >
                    <p className="font-semibold">{item.message}</p>
                    <p className="mt-1">
                      {item?.meta?.method || "-"} {item?.meta?.path || "-"}
                    </p>
                    <p className="mt-1 text-rose-700">{formatDateTime(item.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="manager-list-panel rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Oxirgi restartlar</p>
            <div className="mt-2 space-y-2">
              {(monitoring?.recentStartups || []).length === 0 ? (
                <p className="text-sm text-slate-500">Restart yozuvlari topilmadi</p>
              ) : (
                monitoring.recentStartups.slice(0, 5).map((item) => (
                  <div
                    key={item._id}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                  >
                    <p className="font-semibold">{item.message}</p>
                    <p className="mt-1">{formatDateTime(item.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export default ManagerDashboard;
