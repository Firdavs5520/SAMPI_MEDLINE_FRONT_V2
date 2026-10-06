import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import usageService from "../services/usageService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import LorCheckEditModal from "../components/LorCheckEditModal.jsx";
import { canEditLorCheck } from "../utils/lorCheckEdit.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  extractErrorMessage,
  formatCurrency,
  formatDateTime,
  formatShortDateTime
} from "../utils/format.js";
import {
  closePrintTab,
  openPendingPrintTab,
  writeCheckToPrintTab
} from "../utils/printReceipt.js";

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

const getDebtAmount = (row) => Number(row?.cashierStatus?.debtAmount || 0);

const hasDebt = (row) => Boolean(row?.cashierStatus?.accepted) && getDebtAmount(row) > 0;

const getCheckKey = (row) => String(row?._id || row?.id || row?.checkId || "");

const getPaymentLabel = (value) => paymentMethodLabels[value] || value || "-";

const compactText = (value, fallback = "-") => {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.length > 70 ? `${text.slice(0, 67)}...` : text;
};

const getPatientInitials = (value) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "BM";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
};

const renderCashierStatus = (row) => {
  const accepted = Boolean(row?.cashierStatus?.accepted);
  const debt = hasDebt(row);
  const statusClass = debt ? "debt" : accepted ? "success" : "pending";
  const label = debt ? "Qarzi bor" : accepted ? "Qabul qilingan" : "Kutilmoqda";

  return <span className={`sampi-lor-status sampi-lor-status-${statusClass}`}>{label}</span>;
};

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

function LorChecksPage() {
  const navigate = useNavigate();
  const { user, lorIdentity, lorDoctor } = useAuth();
  const [editingCheck, setEditingCheck] = useState(null);
  const [success, setSuccess] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState([]);
  const [query, setQuery] = useState("");
  const [hoverPreview, setHoverPreview] = useState(null);
  const [reprintingCheckKey, setReprintingCheckKey] = useState("");
  const hasLoadedRef = useRef(false);
  const hoverTimerRef = useRef(null);
  const hoverCloseTimerRef = useRef(null);
  const checkSuggestions = useMemo(() => {
    const uniq = new Map();
    checks.forEach((item) => {
      const name = String(item?.patient?.fullName || "").trim();
      const queueCode = String(item?.lorQueue?.queueCode || "").trim();

      if (queueCode) {
        const key = `queue:${queueCode}`;
        if (!uniq.has(key)) {
          uniq.set(key, { id: key, name: queueCode });
        }
      }

      if (!name) return;
      const key = name.toLowerCase();
      if (!uniq.has(key)) {
        uniq.set(key, { id: key, name });
      }
    });
    return Array.from(uniq.values());
  }, [checks]);

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

  const loadChecks = useCallback(async (searchValue = "") => {
    const isInitial = !hasLoadedRef.current;
    if (!isInitial) {
      setSearching(true);
    }
    setError("");
    try {
      const data = await usageService.getMyChecks(searchValue, lorIdentity, lorDoctor);
      setChecks(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setSearching(false);
    }
  }, [lorIdentity, lorDoctor]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadChecks(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query, lorIdentity, lorDoctor, loadChecks]);

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
    if (!hasDebt(row)) {
      setHoverPreview(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const cardWidth = Math.min(304, window.innerWidth - 32);
    const cardHeight = 176;
    const topSafe = 76;
    const bottomSafe = window.innerHeight - 16;
    const canPlaceRight = rect.right + cardWidth + 12 <= window.innerWidth - 16;
    const canPlaceLeft = rect.left - cardWidth - 12 >= 16;
    const boundaryBottom = bottomSafe;
    const spaceBelow = boundaryBottom - rect.bottom - 12;
    const spaceAbove = rect.top - topSafe - 12;
    let placement = "right";
    let left = rect.right + 12;
    let desiredTop = rect.top + rect.height / 2 - cardHeight / 2;

    if (!canPlaceRight && canPlaceLeft) {
      placement = "left";
      left = rect.left - cardWidth - 12;
    } else if (!canPlaceRight) {
      const shouldPlaceAbove = spaceBelow < cardHeight && spaceAbove > spaceBelow;
      placement = shouldPlaceAbove ? "top" : "bottom";
      desiredTop = shouldPlaceAbove ? rect.top - cardHeight - 12 : rect.bottom + 12;
      left = rect.left - 16;
    }

    const top = Math.max(topSafe, Math.min(bottomSafe - cardHeight, desiredTop));
    left = Math.min(window.innerWidth - cardWidth - 16, Math.max(16, left));
    hoverTimerRef.current = setTimeout(() => {
      setHoverPreview({ checkKey: nextKey, top, left, placement });
      hoverTimerRef.current = null;
    }, 120);
  };

  // Qalamcha 12 soat o'tganda o'zi yo'qolishi uchun vaqtni har daqiqada yangilaymiz.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckSaved = async (updated, { print }) => {
    const previous = editingCheck;
    setEditingCheck(null);
    setSuccess(`Chek ${updated?.checkId || ""} yangilandi.`);
    await loadChecks(query.trim());
    if (print && updated) {
      await handleReprintCheck({ ...previous, ...updated, cashierStatus: previous?.cashierStatus });
    }
  };

  const clearSearch = () => {
    setQuery("");
  };

  // Shu bemorni yana qabul qilish: qabul sahifasi bemor ismi va o'tgan safargi
  // xizmatlar bilan ochiladi, navbat raqami qabul qilinganda ular o'zi to'ladi.
  const handleReadmit = (row) => {
    navigate("/lor/services", {
      state: {
        readmit: {
          patientName: String(row.patient?.fullName || "").trim(),
          items: (row.items || []).map((item) => ({
            name: String(item?.name || "").trim(),
            quantity: Number(item?.quantity || 1)
          }))
        }
      }
    });
  };

  const handleReprintCheck = async (row) => {
    const checkKey = getCheckKey(row);
    if (!checkKey || reprintingCheckKey) return;

    setError("");
    setReprintingCheckKey(checkKey);
    const printSession = openPendingPrintTab();

    try {
      const printed = await writeCheckToPrintTab(printSession, row);
      if (!printed) {
        throw new Error("Brauzer yangi oynani blokladi. Oynaga ruxsatni yoqing.");
      }
    } catch (err) {
      closePrintTab(printSession);
      setError(extractErrorMessage(err));
    } finally {
      setTimeout(() => {
        setReprintingCheckKey((current) => (current === checkKey ? "" : current));
      }, 450);
    }
  };

  if (loading) {
    return <Spinner page text="Mening cheklarim yuklanmoqda..." />;
  }

  return (
    <div className="sampi-lor-checks-page space-y-6 overflow-x-hidden">
      <div className="card sampi-lor-search-card p-4 sm:p-5">
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
      <Alert type="success" message={success} />

      <div className="card sampi-lor-table-card p-4 sm:p-5">
        <div onMouseLeave={() => clearHoverPreview({ delay: 180 })}>
          <Table
            data={prioritizedChecks}
            rowClassName={(row, rowIndex) => {
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
              key: "queueCode",
              label: "Navbat",
              render: (row) => (
                <span className="inline-flex h-10 min-w-[2.75rem] items-center justify-center rounded-lg bg-slate-100 px-2 text-lg font-black tabular-nums text-slate-800">
                  {row?.lorQueue?.queueCode || "-"}
                </span>
              )
            },
            {
              key: "patient",
              label: "Bemor",
              render: (row) => {
                const patientName = row.patient?.fullName || "-";
                const debt = hasDebt(row);
                return (
                  <div
                    className="relative min-w-[11rem] max-w-[17rem] outline-none"
                    tabIndex={0}
                    onMouseEnter={(event) => queueHoverPreview(row, event)}
                    onMouseLeave={() => clearHoverPreview({ delay: 180 })}
                    onFocus={(event) => queueHoverPreview(row, event)}
                    onBlur={() => clearHoverPreview({ delay: 0 })}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-black tracking-wide text-white ${
                          debt ? "bg-slate-900" : "bg-slate-800"
                        }`}
                      >
                        {getPatientInitials(patientName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-800" title={patientName}>
                          {patientName}
                        </p>
                        <p className="whitespace-nowrap text-[11px] font-semibold text-slate-500">
                          {formatShortDateTime(row.createdAt)}
                        </p>
                        <p
                          className="truncate text-[11px] font-medium text-slate-400"
                          title={row.checkId || ""}
                        >
                          {row.checkId || "-"}
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
                <ul className="min-w-[13rem] max-w-[26rem] space-y-1">
                  {(row.items || []).map((item, idx) => (
                    <li
                      key={`${item.name}-${idx}`}
                      className="flex items-start justify-between gap-3 text-xs leading-5 text-slate-700"
                    >
                      <span className="min-w-0 break-words">{item.name}</span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-500">
                        ×{item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            },
            {
              key: "total",
              label: "Jami",
              render: (row) => (
                <span className="whitespace-nowrap text-sm font-black tabular-nums text-slate-800">
                  {formatCurrency(row.total)} so'm
                </span>
              )
            },
            {
              key: "cashierStatus",
              label: "Kassa",
              render: (row) => {
                const accepted = Boolean(row?.cashierStatus?.accepted);
                const debt = getDebtAmount(row);
                return (
                  <div className="min-w-[8.5rem] space-y-1.5">
                    {renderCashierStatus(row)}
                    {accepted ? (
                      <p className="text-xs leading-5 text-slate-600">
                        To'langan:{" "}
                        <span className="font-bold tabular-nums">
                          {formatCurrency(row.cashierStatus.paidAmount || 0)} so'm
                        </span>
                        {" · "}
                        {getPaymentLabel(row.cashierStatus.paymentMethod)}
                      </p>
                    ) : null}
                    {accepted && debt > 0 ? (
                      <span className="sampi-lor-debt-chip inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-black text-white shadow-sm">
                        Qarz: {formatCurrency(debt)} so'm
                      </span>
                    ) : null}
                  </div>
                );
              }
            },
            {
              key: "actions",
              label: "Amal",
              render: (row) => {
                const checkKey = getCheckKey(row);
                const editable = canEditLorCheck(row, now);
                return (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      className="whitespace-nowrap bg-sky-600 px-3 py-1.5 text-xs hover:bg-sky-700"
                      onClick={() => handleReadmit(row)}
                    >
                      Qayta qabul qilish
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={reprintingCheckKey === checkKey}
                      loadingText="Chiqarilmoqda..."
                      disabled={Boolean(reprintingCheckKey) && reprintingCheckKey !== checkKey}
                      className="whitespace-nowrap px-3 py-1.5 text-xs"
                      onClick={() => handleReprintCheck(row)}
                    >
                      Qayta chiqarish
                    </Button>
                    {editable ? (
                      <button
                        type="button"
                        title="Chekni tahrirlash (12 soat ichida)"
                        aria-label="Chekni tahrirlash"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition hover:bg-slate-300"
                        onClick={() => {
                          setError("");
                          setSuccess("");
                          setEditingCheck(row);
                        }}
                      >
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                );
              }
            }
            ]}
          />
        </div>
        {hoverPreviewRow && (
          <div
            className="sampi-cashier-popover sampi-cashier-popover-danger fixed z-50 w-[min(19rem,calc(100vw-2rem))] rounded-xl border p-2.5 text-xs shadow-2xl"
            data-placement={hoverPreview.placement}
            style={{ top: hoverPreview.top, left: hoverPreview.left }}
            onMouseEnter={() => {
              clearHoverTimer();
              clearHoverCloseTimer();
            }}
            onMouseLeave={() => clearHoverPreview({ delay: 0 })}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="sampi-popover-kicker text-[10px] font-black uppercase tracking-wide">
                  Kassa tafsilotlari
                </p>
                <p className="mt-0.5 truncate text-sm font-black leading-4 text-white">
                  {hoverPreviewRow.patient?.fullName || "-"}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-bold text-red-100/80">
                  Chek: {hoverPreviewRow.checkId || "-"}
                </p>
              </div>
              <span className="sampi-popover-chip shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                Diqqat
              </span>
            </div>
            {hoverPreviewRow?.cashierStatus?.accepted ? (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="sampi-popover-metric rounded-lg px-2 py-1">
                    <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">
                      To'langan
                    </span>
                    <span className="font-black leading-4">
                      {formatCurrency(hoverPreviewRow.cashierStatus.paidAmount || 0)} so'm
                    </span>
                  </div>
                  <div className="sampi-popover-metric rounded-lg px-2 py-1">
                    <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">
                      Qarz
                    </span>
                    <span className="font-black leading-4">
                      {formatCurrency(hoverPreviewRow.cashierStatus.debtAmount || 0)} so'm
                    </span>
                  </div>
                </div>
                <div className="sampi-popover-info grid gap-1 leading-4">
                  <p className="truncate">
                    <span className="font-bold">Telefon:</span>{" "}
                    {hoverPreviewRow.cashierStatus.patientPhone || "-"}
                  </p>
                  <p className="truncate" title={hoverPreviewRow.cashierStatus.note || ""}>
                    <span className="font-bold">Izoh:</span>{" "}
                    {compactText(hoverPreviewRow.cashierStatus.note, "Izoh qoldirilmagan")}
                  </p>
                  <p className="truncate">
                    <span className="font-bold">Kassir:</span>{" "}
                    {hoverPreviewRow.cashierStatus.acceptedByName || "-"}
                  </p>
                </div>
                <div className="sampi-popover-footer truncate">
                  {getPaymentLabel(hoverPreviewRow.cashierStatus.paymentMethod)} -{" "}
                  {formatDateTime(hoverPreviewRow.cashierStatus.acceptedAt)}
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
      <LorCheckEditModal
        open={Boolean(editingCheck)}
        check={editingCheck}
        currentUserId={String(user?.id || user?._id || "")}
        onClose={() => setEditingCheck(null)}
        onSaved={handleCheckSaved}
      />
    </div>
  );
}

export default LorChecksPage;
