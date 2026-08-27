import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import usageService from "../services/usageService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage, formatCurrency, formatDateTime } from "../utils/format.js";

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

function NurseChecksPage() {
  const { nurseSpecialist, setNurseSpecialist } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState([]);
  const [specialists, setSpecialists] = useState([]);
  const [query, setQuery] = useState("");
  const hasLoadedRef = useRef(false);
  const selectedSpecialist = useMemo(() => {
    const selected =
      specialists.find((item) => item._id === nurseSpecialist?.id) ||
      (!specialists.length && nurseSpecialist?.id
        ? { _id: nurseSpecialist.id, name: nurseSpecialist.name }
        : null);
    if (!selected?._id || !selected?.name) return null;
    return {
      id: selected._id,
      name: selected.name
    };
  }, [nurseSpecialist?.id, nurseSpecialist?.name, specialists]);
  const specialistOptions = useMemo(
    () => specialists.map((item) => ({ value: item._id, label: item.name })),
    [specialists]
  );
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

  const loadSpecialists = useCallback(async () => {
    const data = await usageService.getRoleSpecialists();
    const list = data || [];
    setSpecialists(list);
    if (
      (!nurseSpecialist?.id ||
        !list.some((item) => item._id === nurseSpecialist.id)) &&
      list[0]?._id
    ) {
      setNurseSpecialist({ id: list[0]._id, name: list[0].name });
    }
  }, [nurseSpecialist?.id, setNurseSpecialist]);

  const loadChecks = useCallback(async (searchValue = "") => {
    const isInitial = !hasLoadedRef.current;
    if (!isInitial) {
      setSearching(true);
    }
    setError("");
    try {
      if (!selectedSpecialist?.id) {
        setChecks([]);
        return;
      }
      const data = await usageService.getMyChecks(searchValue, "", selectedSpecialist);
      setChecks(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setSearching(false);
    }
  }, [selectedSpecialist]);

  useEffect(() => {
    loadSpecialists().catch((err) => {
      setError(extractErrorMessage(err));
      setLoading(false);
    });
  }, [loadSpecialists]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadChecks(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query, selectedSpecialist?.id, loadChecks]);

  const handleSpecialistChange = (specialistId) => {
    const specialist = specialists.find((item) => item._id === specialistId);
    if (!specialist) return;
    setNurseSpecialist({ id: specialist._id, name: specialist.name });
    hasLoadedRef.current = false;
  };

  const clearSearch = () => {
    setQuery("");
  };

  if (loading) {
    return <Spinner text="Mening cheklarim yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">Mening cheklarim</h1>
        <p className="mt-1 text-sm text-slate-500">
          Faqat siz yaratgan nurse cheklari chiqadi. Bemor ism-familiyasi bo'yicha qidiring.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr_auto]">
          <SelectMenu
            label="Hamshira"
            value={selectedSpecialist?.id || ""}
            options={specialistOptions}
            onChange={handleSpecialistChange}
            disabled={!specialistOptions.length || searching}
          />
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
      </div>

      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        <Table
          data={checks}
          columns={[
            {
              key: "patient",
              label: "Bemor",
              render: (row) => row.patient?.fullName || "-"
            },
            {
              key: "total",
              label: "Jami",
              render: (row) => `${formatCurrency(row.total)} so'm`
            },
            {
              key: "cashierStatus",
              label: "Kassa holati",
              render: (row) => {
                const accepted = Boolean(row?.cashierStatus?.accepted);
                return (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      accepted
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {accepted ? "Qabul qilingan" : "Kutilmoqda"}
                  </span>
                );
              }
            },
            {
              key: "paidAmount",
              label: "To'langan",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? `${formatCurrency(row.cashierStatus.paidAmount || 0)} so'm`
                  : "-"
            },
            {
              key: "debtAmount",
              label: "Qarz",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? `${formatCurrency(row.cashierStatus.debtAmount || 0)} so'm`
                  : "-"
            },
            {
              key: "paymentMethod",
              label: "To'lov",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? paymentMethodLabels[row.cashierStatus.paymentMethod] || row.cashierStatus.paymentMethod
                  : "-"
            },
            {
              key: "createdAt",
              label: "Sana",
              render: (row) => formatDateTime(row.createdAt)
            }
          ]}
        />
      </div>
    </div>
  );
}

export default NurseChecksPage;
