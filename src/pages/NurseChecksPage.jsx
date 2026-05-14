import { useEffect, useMemo, useState } from "react";
import usageService from "../services/usageService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { extractErrorMessage, formatCurrency, formatDateTime } from "../utils/format.js";

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

function NurseChecksPage() {
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState([]);
  const [query, setQuery] = useState("");
  const checkSuggestions = useMemo(() => {
    const uniq = new Map();
    checks.forEach((item) => {
      const name = String(item?.patient?.fullName || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!uniq.has(key)) {
        uniq.set(key, { id: key, name });
      }
    });
    return Array.from(uniq.values());
  }, [checks]);
  const acceptedCount = useMemo(
    () => checks.filter((item) => Boolean(item?.cashierStatus?.accepted)).length,
    [checks]
  );
  const pendingCount = useMemo(() => checks.length - acceptedCount, [checks.length, acceptedCount]);
  const totalAmount = useMemo(
    () => checks.reduce((sum, item) => sum + Number(item?.total || 0), 0),
    [checks]
  );
  const totalDebt = useMemo(
    () =>
      checks.reduce(
        (sum, item) =>
          sum + (item?.cashierStatus?.accepted ? Number(item?.cashierStatus?.debtAmount || 0) : 0),
        0
      ),
    [checks]
  );

  const loadChecks = async (searchValue = "") => {
    const isInitial = loading;
    if (!isInitial) {
      setSearching(true);
    }
    setError("");
    try {
      const data = await usageService.getMyChecks(searchValue);
      setChecks(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadChecks(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const clearSearch = () => {
    setQuery("");
  };

  if (loading) {
    return <Spinner text="Mening cheklarim yuklanmoqda..." />;
  }

  return (
    <div className="nurse-theme-shell space-y-6 overflow-x-hidden">
      <div className="card nurse-hero-card p-4 sm:p-5">
        <p className="nurse-hero-badge">Hamshira cheklari</p>
        <h1 className="nurse-hero-title">Mening cheklarim</h1>
        <p className="nurse-hero-subtitle">
          Faqat siz yaratgan hamshira cheklari chiqadi. Bemor ism-familiyasi bo'yicha qidiring.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="nurse-hero-kpi">
            <span>Jami cheklar</span>
            <strong>{checks.length}</strong>
          </div>
          <div className="nurse-hero-kpi">
            <span>Qabul qilingan</span>
            <strong>{acceptedCount}</strong>
          </div>
          <div className="nurse-hero-kpi">
            <span>Jami summa</span>
            <strong>{formatCurrency(totalAmount)}</strong>
          </div>
          <div className="nurse-hero-kpi">
            <span>Jami qarz</span>
            <strong>{formatCurrency(totalDebt)}</strong>
          </div>
        </div>
      </div>

      <div className="card nurse-work-card p-4 sm:p-5">
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <QuickSearchInput
            label="Bemor ism-familiyasi"
            placeholder="Masalan: Ali Valiyev"
            value={query}
            onChange={setQuery}
            items={checkSuggestions}
            getItemLabel={(item) => item?.name || ""}
            onPick={(item) => setQuery(item?.name || "")}
            emptyText="Mos bemor topilmadi"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={clearSearch}
            disabled={!query && !searching}
            className="h-fit self-end"
          >
            Tozalash
          </Button>
        </div>
        <div className="nurse-inline-info mt-4">
          <span>Qidiruv natijasi: {checks.length} ta</span>
          <strong>Kutilayotgan: {pendingCount} ta</strong>
        </div>
      </div>

      <Alert type="error" message={error} />

      <div className="card nurse-work-card p-4 sm:p-5">
        <Table
          data={checks}
          stickyHeader
          emptyTitle="Cheklar topilmadi"
          emptyDescription="Hozircha siz yaratgan hamshira cheklari mavjud emas."
          columns={[
            {
              key: "patient",
              label: "Bemor",
              render: (row) => row.patient?.fullName || "-"
            },
            {
              key: "total",
              label: "Jami",
              hideOnMobile: true,
              render: (row) => `${formatCurrency(row.total)} so'm`
            },
            {
              key: "cashierStatus",
              label: "Kassa holati",
              render: (row) => {
                const accepted = Boolean(row?.cashierStatus?.accepted);
                return (
                  <StatusBadge tone={accepted ? "success" : "warn"}>
                    {accepted ? "Qabul qilingan" : "Kutilmoqda"}
                  </StatusBadge>
                );
              }
            },
            {
              key: "paidAmount",
              label: "To'langan",
              hideOnMobile: true,
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? `${formatCurrency(row.cashierStatus.paidAmount || 0)} so'm`
                  : "-"
            },
            {
              key: "debtAmount",
              label: "Qarz",
              hideOnMobile: true,
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? `${formatCurrency(row.cashierStatus.debtAmount || 0)} so'm`
                  : "-"
            },
            {
              key: "paymentMethod",
              label: "To'lov",
              hideOnTablet: true,
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? paymentMethodLabels[row.cashierStatus.paymentMethod] || row.cashierStatus.paymentMethod
                  : "-"
            },
            {
              key: "createdAt",
              label: "Sana",
              hideOnMobile: true,
              render: (row) => formatDateTime(row.createdAt)
            }
          ]}
        />
      </div>
    </div>
  );
}

export default NurseChecksPage;
