import { useEffect, useMemo, useRef, useState } from "react";
import usageService from "../services/usageService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage, formatCurrency, formatDateTime } from "../utils/format.js";

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

const getDebtAmount = (row) => Number(row?.cashierStatus?.debtAmount || 0);

const hasDebt = (row) => Boolean(row?.cashierStatus?.accepted) && getDebtAmount(row) > 0;

const getCheckKey = (row) => String(row?._id || row?.id || row?.checkId || "");

const getPaymentLabel = (value) => paymentMethodLabels[value] || value || "-";

const getPatientInitials = (value) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "BM";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
};

function LorChecksPage() {
  const { lorIdentity } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState([]);
  const [query, setQuery] = useState("");
  const [hoverPreview, setHoverPreview] = useState(null);
  const hoverTimerRef = useRef(null);
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

  const debtSummary = useMemo(
    () =>
      checks.reduce(
        (acc, row) => {
          if (!hasDebt(row)) return acc;
          return {
            count: acc.count + 1,
            totalDebt: acc.totalDebt + getDebtAmount(row)
          };
        },
        { count: 0, totalDebt: 0 }
      ),
    [checks]
  );

  const prioritizedChecks = useMemo(
    () =>
      checks
        .map((item, index) => ({
          item,
          index,
          debt: hasDebt(item)
        }))
        .sort((a, b) => Number(b.debt) - Number(a.debt) || a.index - b.index)
        .map(({ item }) => item),
    [checks]
  );

  const hoverPreviewRow = useMemo(
    () =>
      prioritizedChecks.find((row) => getCheckKey(row) === hoverPreview?.checkKey) || null,
    [prioritizedChecks, hoverPreview?.checkKey]
  );

  const loadChecks = async (searchValue = "") => {
    const isInitial = loading;
    if (!isInitial) {
      setSearching(true);
    }
    setError("");
    try {
      const data = await usageService.getMyChecks(searchValue, lorIdentity);
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
  }, [query, lorIdentity]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    },
    []
  );

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const clearHoverPreview = () => {
    clearHoverTimer();
    setHoverPreview(null);
  };

  const queueHoverPreview = (row, event) => {
    const nextKey = getCheckKey(row);
    if (!nextKey) return;

    clearHoverTimer();
    setHoverPreview(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 220, Math.max(84, rect.bottom + 10));
    const left = Math.min(window.innerWidth - 360, Math.max(16, rect.left));
    hoverTimerRef.current = setTimeout(() => {
      setHoverPreview({ checkKey: nextKey, top, left });
      hoverTimerRef.current = null;
    }, 3000);
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
          Faqat siz yaratgan cheklar chiqadi. Bemor ism-familiyasi bo'yicha qidiring.
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Tanlangan LOR: {lorIdentity ? lorIdentity.toUpperCase() : "-"}
        </p>

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
      </div>

      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        {debtSummary.count > 0 && (
          <div className="mb-4 rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900 shadow-[0_18px_35px_-28px_rgba(220,38,38,0.8)]">
            <p className="text-sm font-black uppercase tracking-wide text-red-700">Diqqat: qarzdor bemorlar bor</p>
            <p className="mt-1 text-sm font-semibold">
              Qarzdorlar soni: {debtSummary.count} ta, jami qarz: {formatCurrency(debtSummary.totalDebt)} so'm
            </p>
            <p className="mt-1 text-xs font-bold text-red-700">
              Qizil qatorlar qarzi yopilmaguncha alohida ko'rsatiladi.
            </p>
          </div>
        )}
        <div onMouseLeave={clearHoverPreview}>
          <Table
            data={prioritizedChecks}
            rowClassName={(row, rowIndex) => {
              const debt = hasDebt(row);
              if (debt) {
                return "bg-red-50/95 shadow-[inset_6px_0_0_#dc2626] ring-2 ring-inset ring-red-300 hover:bg-red-100/95";
              }

              if (row?.cashierStatus?.accepted) {
                return rowIndex % 2 === 0
                  ? "bg-sky-50/55 hover:bg-sky-100/70"
                  : "bg-cyan-50/40 hover:bg-cyan-100/70";
              }

              return rowIndex % 2 === 0
                ? "bg-amber-50/45 hover:bg-amber-100/70"
                : "bg-white hover:bg-slate-50/85";
            }}
            columns={[
            {
              key: "lorIdentity",
              label: "LOR",
              render: (row) => {
                const value = String(row?.createdBy?.lorIdentity || "");
                return value ? value.toUpperCase().replace("LOR", "LOR-") : "-";
              }
            },
            {
              key: "patient",
              label: "Bemor",
              render: (row) => {
                const patientName = row.patient?.fullName || "-";
                const debt = hasDebt(row);
                const isQueued = getCheckKey(row) === hoverPreview?.checkKey;
                return (
                  <div
                    className="relative max-w-[280px]"
                    onMouseEnter={(event) => queueHoverPreview(row, event)}
                    onMouseLeave={clearHoverPreview}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-black tracking-wide text-white ${
                          debt ? "bg-red-700 shadow-[0_0_0_3px_rgba(254,202,202,0.9)]" : "bg-slate-800"
                        }`}
                      >
                        {getPatientInitials(patientName)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className={`truncate text-sm font-black ${debt ? "text-red-900" : "text-slate-800"}`}>
                            {patientName}
                          </p>
                          {debt ? (
                            <span className="shrink-0 rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                              Qarzdor
                            </span>
                          ) : null}
                        </div>
                        <p className={`truncate text-[11px] font-bold ${debt ? "text-red-700" : "text-slate-500"}`}>
                          Chek: {row.checkId || "-"} {isQueued ? "- 3 soniyadan keyin tafsilot" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
            },
            {
              key: "items",
              label: "Xizmatlar",
              render: (row) => (
                <div className="space-y-1">
                  {(row.items || []).map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="text-xs leading-5 text-slate-700">
                      {item.name} x{item.quantity}
                    </div>
                  ))}
                </div>
              )
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
                const debt = hasDebt(row);
                return (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      debt
                        ? "bg-red-700 text-white"
                        : accepted
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {debt ? "Qarzi bor" : accepted ? "Qabul qilingan" : "Kutilmoqda"}
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
              render: (row) => {
                if (!row?.cashierStatus?.accepted) return "-";
                const debt = getDebtAmount(row);
                if (debt <= 0) {
                  return `${formatCurrency(debt)} so'm`;
                }

                return (
                  <span className="inline-flex animate-pulse items-center rounded-md border-2 border-red-500 bg-red-700 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-white shadow-sm">
                    Qarzdor: {formatCurrency(debt)} so'm
                  </span>
                );
              }
            },
            {
              key: "paymentMethod",
              label: "To'lov",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? getPaymentLabel(row.cashierStatus.paymentMethod)
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
        {hoverPreviewRow && (
          <div
            className={`fixed z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border p-4 text-sm shadow-2xl ${
              hasDebt(hoverPreviewRow)
                ? "border-red-300 bg-red-50 text-red-950"
                : "border-cyan-200 bg-cyan-50 text-cyan-950"
            }`}
            style={{ top: hoverPreview.top, left: hoverPreview.left }}
            onMouseEnter={clearHoverTimer}
            onMouseLeave={clearHoverPreview}
          >
            <p
              className={`text-xs font-black uppercase tracking-wide ${
                hasDebt(hoverPreviewRow) ? "text-red-700" : "text-cyan-700"
              }`}
            >
              Kassa tafsilotlari
            </p>
            <p className="mt-1 text-sm font-black">
              {hoverPreviewRow.patient?.fullName || "-"}
            </p>
            <p className="mt-0.5 text-xs font-bold">Chek: {hoverPreviewRow.checkId || "-"}</p>
            {hoverPreviewRow?.cashierStatus?.accepted ? (
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <p>
                  <span className="font-bold">Kassir:</span>{" "}
                  {hoverPreviewRow.cashierStatus.acceptedByName || "-"}
                </p>
                <p>
                  <span className="font-bold">Telefon:</span>{" "}
                  {hoverPreviewRow.cashierStatus.patientPhone || "-"}
                </p>
                <p>
                  <span className="font-bold">To'lov raqami:</span>{" "}
                  {hoverPreviewRow.cashierStatus.checkCode || hoverPreviewRow.checkId || "-"}
                </p>
                <p>
                  <span className="font-bold">Qabul vaqti:</span>{" "}
                  {formatDateTime(hoverPreviewRow.cashierStatus.acceptedAt)}
                </p>
                <p>
                  <span className="font-bold">To'lov turi:</span>{" "}
                  {getPaymentLabel(hoverPreviewRow.cashierStatus.paymentMethod)}
                </p>
                <p>
                  <span className="font-bold">Qarz:</span>{" "}
                  {formatCurrency(hoverPreviewRow.cashierStatus.debtAmount || 0)} so'm
                </p>
                <p className="sm:col-span-2">
                  <span className="font-bold">Izoh:</span>{" "}
                  {hoverPreviewRow.cashierStatus.note || "Izoh qoldirilmagan"}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Bu bemor cheki hali kassaga qabul qilinmagan.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LorChecksPage;
