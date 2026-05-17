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
  const hoverCloseTimerRef = useRef(null);
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
      if (hoverCloseTimerRef.current) {
        clearTimeout(hoverCloseTimerRef.current);
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

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const clearHoverPreview = ({ delay = 140 } = {}) => {
    clearHoverTimer();
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = setTimeout(() => {
      setHoverPreview(null);
      hoverCloseTimerRef.current = null;
    }, delay);
  };

  const queueHoverPreview = (row, event) => {
    const nextKey = getCheckKey(row);
    if (!nextKey) return;

    clearHoverTimer();
    clearHoverCloseTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    const cardWidth = Math.min(320, window.innerWidth - 32);
    const cardHeight = hasDebt(row) ? 248 : 170;
    const shouldPlaceAbove = rect.bottom + cardHeight + 18 > window.innerHeight;
    const top = shouldPlaceAbove
      ? Math.max(76, rect.top - cardHeight - 12)
      : Math.min(window.innerHeight - cardHeight - 16, Math.max(76, rect.bottom + 12));
    const left = Math.min(window.innerWidth - cardWidth - 16, Math.max(16, rect.left - 12));
    hoverTimerRef.current = setTimeout(() => {
      setHoverPreview({ checkKey: nextKey, top, left, placement: shouldPlaceAbove ? "top" : "bottom" });
      hoverTimerRef.current = null;
    }, 120);
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
          <div className="sampi-debt-radar sticky top-20 z-10 mb-4 overflow-hidden rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-950 shadow-[0_18px_35px_-28px_rgba(220,38,38,0.9)]">
            <div className="relative z-[1] grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-red-700">
                  Qarzdor bemorlar yuqorida ushlab turildi
                </p>
                <p className="mt-1 text-sm font-semibold">
                  Qarz yopilmaguncha bu qatorlar qizil signal bilan ajralib turadi.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-red-200 bg-white/80 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wide text-red-600">Soni</p>
                  <p className="text-lg font-black text-red-800">{debtSummary.count}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-white/80 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wide text-red-600">Jami qarz</p>
                  <p className="text-lg font-black text-red-800">
                    {formatCurrency(debtSummary.totalDebt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div onMouseLeave={() => clearHoverPreview({ delay: 180 })}>
          <Table
            data={prioritizedChecks}
            rowClassName={(row, rowIndex) => {
              const debt = hasDebt(row);
              if (debt) {
                return "sampi-debt-row bg-red-50/95 shadow-[inset_6px_0_0_#dc2626] ring-2 ring-inset ring-red-300 hover:bg-red-100/95";
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
                    className="relative max-w-[280px] outline-none"
                    tabIndex={0}
                    onMouseEnter={(event) => queueHoverPreview(row, event)}
                    onMouseLeave={() => clearHoverPreview({ delay: 180 })}
                    onFocus={(event) => queueHoverPreview(row, event)}
                    onBlur={() => clearHoverPreview({ delay: 0 })}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-black tracking-wide text-white ${
                          debt ? "sampi-debt-orbit bg-red-700" : "bg-slate-800"
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
                            <span className="sampi-debt-pill shrink-0 rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                              Qarz yopilmagan
                            </span>
                          ) : null}
                        </div>
                        <p className={`truncate text-[11px] font-bold ${debt ? "text-red-700" : "text-slate-500"}`}>
                          Chek: {row.checkId || "-"} {isQueued ? "- kassa tafsiloti ochiq" : ""}
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
            className={`sampi-cashier-popover fixed z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border p-3 text-sm shadow-2xl ${
              hasDebt(hoverPreviewRow)
                ? "border-red-300 bg-red-50 text-red-950"
                : "border-cyan-200 bg-cyan-50 text-cyan-950"
            }`}
            data-placement={hoverPreview.placement}
            style={{ top: hoverPreview.top, left: hoverPreview.left }}
            onMouseEnter={() => {
              clearHoverTimer();
              clearHoverCloseTimer();
            }}
            onMouseLeave={() => clearHoverPreview({ delay: 0 })}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-[11px] font-black uppercase tracking-wide ${
                    hasDebt(hoverPreviewRow) ? "text-red-700" : "text-cyan-700"
                  }`}
                >
                  Kassa tafsilotlari
                </p>
                <p className="mt-1 truncate text-sm font-black">
                  {hoverPreviewRow.patient?.fullName || "-"}
                </p>
                <p className="mt-0.5 text-xs font-bold">Chek: {hoverPreviewRow.checkId || "-"}</p>
              </div>
              {hasDebt(hoverPreviewRow) ? (
                <span className="rounded-full bg-red-700 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                  Diqqat
                </span>
              ) : null}
            </div>
            {hoverPreviewRow?.cashierStatus?.accepted ? (
              <div className="mt-3 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">
                      To'langan
                    </span>
                    <span className="font-black">
                      {formatCurrency(hoverPreviewRow.cashierStatus.paidAmount || 0)} so'm
                    </span>
                  </div>
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">
                      Qarz
                    </span>
                    <span className="font-black">
                      {formatCurrency(hoverPreviewRow.cashierStatus.debtAmount || 0)} so'm
                    </span>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <p>
                    <span className="font-bold">Telefon:</span>{" "}
                    {hoverPreviewRow.cashierStatus.patientPhone || "-"}
                  </p>
                  <p>
                    <span className="font-bold">Izoh:</span>{" "}
                    {hoverPreviewRow.cashierStatus.note || "Izoh qoldirilmagan"}
                  </p>
                  <p>
                    <span className="font-bold">Kassir:</span>{" "}
                    {hoverPreviewRow.cashierStatus.acceptedByName || "-"}
                  </p>
                  <p>
                    <span className="font-bold">Vaqt:</span>{" "}
                    {formatDateTime(hoverPreviewRow.cashierStatus.acceptedAt)}
                  </p>
                  <p>
                    <span className="font-bold">To'lov:</span>{" "}
                    {getPaymentLabel(hoverPreviewRow.cashierStatus.paymentMethod)}
                  </p>
                </div>
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
