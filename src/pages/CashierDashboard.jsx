import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Spinner from "../components/Spinner.jsx";
import PrintingOverlay from "../components/PrintingOverlay.jsx";
import Table from "../components/Table.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import cashierService from "../services/cashierService.js";
import {
  closePrintTab,
  openPendingPrintTab,
  prerenderLorQueueTicket,
  writeLorQueueTicketToPrintTab
} from "../utils/printReceipt.js";
import {
  extractErrorMessage,
  formatCurrency,
  formatMoneyInput,
  formatPhoneInput,
  formatShortDateTime,
  toTitleCaseName
} from "../utils/format.js";
import { getCurrentShiftYmd } from "../utils/date.js";
import { fieldError, showFieldError, showFieldErrorFrom } from "../utils/fieldError.js";

const SECTION_META = {
  "nurse-patients": {
    title: "Hamshira cheklari qabuli",
    subtitle: "Hamshira yuborgan cheklar kassada qabul qilinadi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-patients": {
    title: "LOR cheklar qabuli",
    subtitle: "LOR yuborgan cheklar kassada qabul qilinadi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "lor-queue": {
    title: "LOR navbat",
    subtitle: "Kassir bemorni LORga yo'naltirganda navbat chekini chiqaradi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "nurse-entries": {
    title: "Hamshira yozuvlari",
    subtitle: "Joriy ro'yxat 08:00-02:00 oralig'ida ko'rsatiladi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "nurse-history": {
    title: "Hamshira tarixi",
    subtitle: "Hamshira bo'limi bo'yicha 08:00-02:00 dan tashqari yozuvlar tarixi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-entries": {
    title: "LOR yozuvlari",
    subtitle: "Joriy ro'yxat 08:00-02:00 oralig'ida ko'rsatiladi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "lor-history": {
    title: "LOR tarixi",
    subtitle: "LOR bo'yicha 08:00-02:00 dan tashqari yozuvlar tarixi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  journal: {
    title: "Kassa jurnali",
    subtitle: "Barcha yozuvlar umumiy jurnal ko'rinishi.",
    lockedType: null,
    specialistLabel: "Mutaxassis"
  },
  debts: {
    title: "Qarzdorlar ro'yxati",
    subtitle: "Qarz qolgan yozuvlarni yakuniy to'lash bo'limi.",
    lockedType: null,
    specialistLabel: "Mutaxassis"
  },
  "nurse-specialists": {
    title: "Hamshiralar",
    subtitle: "Hamshiralar ro'yxatini boshqarish.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-specialists": {
    title: "LOR shifokorlar",
    subtitle: "LOR mutaxassislar ro'yxatini boshqarish.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  settings: {
    title: "Kassa sozlamalari",
    subtitle: "Smena va kassa ish tartibini boshqarish.",
    lockedType: null,
    specialistLabel: "Mutaxassis"
  }
};

const departmentLabels = {
  lor: "LOR",
  nurse: "Hamshira",
  procedure: "Hamshira"
};

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

const printEventToneClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800"
};

const paymentMethodOptions = [
  { value: "all", label: "Barchasi" },
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
  { value: "transfer", label: "O'tkazma" }
];

const paymentMethodFormOptions = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
  { value: "transfer", label: "O'tkazma" }
];

const departmentOptions = [
  { value: "all", label: "Barchasi" },
  { value: "lor", label: "LOR" },
  { value: "nurse", label: "Hamshira" }
];

const specialistTypeOptions = [
  { value: "all", label: "Barchasi" },
  { value: "nurse", label: "Hamshira" },
  { value: "lor", label: "LOR" }
];

// Chekda "Chek №" sifatida chiqadigan qisqa kod: "CHK-1791299509794-B40CFC" -> "B40CFC".
const getShortCheckId = (checkId) => {
  const parts = String(checkId || "").split("-").filter(Boolean);
  return parts.length ? parts[parts.length - 1].toUpperCase() : "";
};
const SHORT_CHECK_ID_LENGTH = 6;

const getTodayString = (settings = defaultCashierSettings) => getCurrentShiftYmd(settings);
const SHIFT_DATE_REFRESH_MS = 60000;

const canUseDesktopPrinterSettings = () =>
  typeof window !== "undefined" &&
  typeof window.sampiDesktop?.listPrinters === "function" &&
  typeof window.sampiDesktop?.setReceiptPrinter === "function";

const emptyPrinterSettings = {
  available: false,
  loading: false,
  saving: false,
  printers: [],
  selectedPrinterName: "",
  defaultPrinterName: "",
  fallbackPrinterName: "XP-80"
};

const formatDateInput = (value) => {
  if (!value) return getTodayString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getTodayString();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const safeNumber = (value, fallback = 0) => {
  const normalized =
    typeof value === "string" ? value.replace(/[^\d.-]/g, "") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getNextQueueCodePreview = (value) => {
  const parsed = Number(String(value || "").replace(/\D/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return "01";
  return String(parsed + 1).padStart(2, "0");
};

const mergeRecentLorTickets = (tickets = [], ticket) => {
  const seen = new Set();
  return [ticket, ...tickets]
    .filter(Boolean)
    .filter((item) => {
      const key = item.id || item._id || item.queueCode;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
};

const formatCreatorRoleLabel = (value) =>
  String(value || "").toLowerCase() === "nurse" ? "Hamshira" : "LOR";

const formatLorIdentityLabel = (value) => (String(value || "").trim() ? "LOR" : "");

const createInitialForm = (type = "lor") => ({
  department: type,
  specialistId: "",
  patientName: "",
  amount: "",
  paidAmount: "",
  paymentMethod: "cash",
  patientPhone: "",
  note: ""
});

const createInitialFilters = ({ today, lockedType, isDebtSection }) => ({
  date: today,
  department: lockedType || "all",
  specialistType: lockedType || "all",
  paymentMethod: "all",
  debtOnly: Boolean(isDebtSection),
  search: ""
});

const emptySummary = {
  totalAmount: 0,
  totalPaidAmount: 0,
  totalDebtAmount: 0,
  totalEntries: 0,
  bySpecialistType: {
    nurse: { count: 0 },
    lor: { count: 0 }
  }
};

const defaultCashierSettings = {
  shiftStartTime: "08:00",
  shiftEndTime: "02:00",
  lateEntryWarningMinutes: 30,
  requireDebtPhone: true
};

const timeInputPattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeSettingsForm = (settings = {}) => ({
  shiftStartTime: settings.shiftStartTime || defaultCashierSettings.shiftStartTime,
  shiftEndTime: settings.shiftEndTime || defaultCashierSettings.shiftEndTime,
  lateEntryWarningMinutes: String(
    settings.lateEntryWarningMinutes ?? defaultCashierSettings.lateEntryWarningMinutes
  ),
  requireDebtPhone: Boolean(
    settings.requireDebtPhone ?? defaultCashierSettings.requireDebtPhone
  )
});

function SummaryCard({ title, value, hint, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    primary: "border-cyan-200 bg-cyan-50",
    accent: "border-orange-200 bg-orange-50"
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{hint}</p>
    </div>
  );
}

function CashierDashboard({ forcedSection = "nurse-patients" }) {
  // "Bugun" = joriy smena sanasi; smena almashganda (masalan 02:00 da) yangilanadi.
  const [today, setToday] = useState(() => getTodayString());
  const sectionMeta = SECTION_META[forcedSection] || SECTION_META["nurse-patients"];
  const lockedType = sectionMeta.lockedType;
  const isSpecialistSection =
    forcedSection === "nurse-specialists" || forcedSection === "lor-specialists";
  const isLorQueueSection = forcedSection === "lor-queue";
  const isFormSection = forcedSection === "nurse-patients" || forcedSection === "lor-patients";
  const isLorFormSection = forcedSection === "lor-patients";
  const isHistorySection = forcedSection === "nurse-history" || forcedSection === "lor-history";
  const isDebtSection = forcedSection === "debts";
  const isSettingsSection = forcedSection === "settings";
  const isEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "nurse-history" ||
    forcedSection === "lor-entries" ||
    forcedSection === "lor-history" ||
    forcedSection === "journal" ||
    isDebtSection;
  const isCurrentEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "lor-entries" ||
    forcedSection === "journal";
  const shouldShowSummaryCards =
    forcedSection === "nurse-entries" ||
    forcedSection === "nurse-history" ||
    forcedSection === "lor-entries" ||
    forcedSection === "lor-history" ||
    forcedSection === "journal" ||
    isDebtSection;
  const specialistPageType = forcedSection === "nurse-specialists" ? "nurse" : "lor";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const issuingLorTicketRef = useRef(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingSpecialist, setSavingSpecialist] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [issuingLorTicket, setIssuingLorTicket] = useState(false);
  const [reprintingLorTicket, setReprintingLorTicket] = useState(false);
  const [pendingChecksLoading, setPendingChecksLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [pendingChecks, setPendingChecks] = useState([]);
  const [pendingSearch, setPendingSearch] = useState("");
  const [selectedPendingCheck, setSelectedPendingCheck] = useState(null);
  const [issuedLorTicket, setIssuedLorTicket] = useState(null);
  const [lorTicketStatus, setLorTicketStatus] = useState({
    nextQueueCode: "01",
    lastIssued: null,
    recentIssued: []
  });
  const [lorPrintEvents, setLorPrintEvents] = useState([]);
  const [shiftWindow, setShiftWindow] = useState({
    fromLabel: "08:00",
    toLabel: "02:00"
  });
  const [summary, setSummary] = useState(emptySummary);
  const [specialists, setSpecialists] = useState([]);
  const [filters, setFilters] = useState(() =>
    createInitialFilters({ today, lockedType, isDebtSection })
  );
  const [searchInput, setSearchInput] = useState("");
  const [form, setForm] = useState(createInitialForm(lockedType || "lor"));
  const [specialistNameInput, setSpecialistNameInput] = useState("");
  const [settingsForm, setSettingsForm] = useState(() =>
    normalizeSettingsForm(defaultCashierSettings)
  );
  const [printerSettings, setPrinterSettings] = useState(emptyPrinterSettings);
  // null: bu sozlama yo'q (sayt yoki eski desktop ilova).
  const [startFullscreen, setStartFullscreen] = useState(null);
  const [closingDebtId, setClosingDebtId] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const isPendingCheckMode = Boolean(selectedPendingCheck?._id);

  const specialistsByType = useMemo(
    () => ({
      nurse: specialists.filter((item) => item.type === "nurse"),
      lor: specialists.filter((item) => item.type === "lor")
    }),
    [specialists]
  );

  const buildEffectiveFilters = useCallback((baseFilters) => {
    const nextFilters = { ...baseFilters };

    if (lockedType) {
      nextFilters.department = lockedType;
      nextFilters.specialistType = lockedType;
    }

    if (isDebtSection) {
      nextFilters.debtOnly = true;
    }

    if (!lockedType) {
      if (nextFilters.department === "lor" && nextFilters.specialistType === "nurse") {
        nextFilters.specialistType = "lor";
      }

      if (nextFilters.department === "nurse" && nextFilters.specialistType === "lor") {
        nextFilters.specialistType = "nurse";
      }
    }

    return nextFilters;
  }, [lockedType, isDebtSection]);

  const effectiveFilters = useMemo(
    () => buildEffectiveFilters(filters),
    [filters, buildEffectiveFilters]
  );
  const availableSpecialistTypeOptions = useMemo(() => {
    if (lockedType === "lor" || filters.department === "lor") {
      return specialistTypeOptions.filter(
        (item) => item.value === "all" || item.value === "lor"
      );
    }

    if (lockedType === "nurse" || filters.department === "nurse") {
      return specialistTypeOptions.filter(
        (item) => item.value === "all" || item.value === "nurse"
      );
    }

    return specialistTypeOptions;
  }, [lockedType, filters.department]);
  const receiptPrinterOptions = useMemo(
    () =>
      printerSettings.printers.map((printer) => ({
        value: printer.name,
        label: `${printer.displayName || printer.name}${
          printer.isDefault ? " (Windows asosiy)" : ""
        }`
      })),
    [printerSettings.printers]
  );

  const calculatedDebt = useMemo(() => {
    const amount = safeNumber(form.amount, 0);
    const paid = form.paidAmount === "" ? 0 : safeNumber(form.paidAmount, 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (!Number.isFinite(paid) || paid < 0) return amount;
    return Math.max(amount - Math.min(paid, amount), 0);
  }, [form.amount, form.paidAmount]);

  const tableData = useMemo(
    () => entries.map((entry, index) => ({ ...entry, rowNumber: index + 1 })),
    [entries]
  );
  const historyTableData = useMemo(
    () => historyEntries.map((entry, index) => ({ ...entry, rowNumber: index + 1 })),
    [historyEntries]
  );
  const entrySuggestionItems = useMemo(() => {
    const source = isHistorySection ? historyEntries : entries;
    const unique = new Map();

    source.forEach((row) => {
      const patientName = String(row?.patientName || "").trim();
      const specialistName = String(row?.specialistName || "").trim();
      const patientPhone = String(row?.patientPhone || "").trim();

      if (patientName) {
        const key = `patient:${patientName.toLowerCase()}`;
        if (!unique.has(key)) {
          unique.set(key, { id: key, label: patientName });
        }
      }

      if (specialistName) {
        const key = `specialist:${specialistName.toLowerCase()}`;
        if (!unique.has(key)) {
          unique.set(key, { id: key, label: specialistName });
        }
      }

      if (patientPhone) {
        const key = `phone:${patientPhone.toLowerCase()}`;
        if (!unique.has(key)) {
          unique.set(key, { id: key, label: patientPhone });
        }
      }
    });

    return Array.from(unique.values());
  }, [entries, historyEntries, isHistorySection]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const addLorPrintEvent = useCallback((message, tone = "info") => {
    const at = new Date().toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setLorPrintEvents((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          at,
          message,
          tone
        },
        ...prev
      ].slice(0, 5)
    );
  }, []);

  const loadEntries = useCallback(async ({ silent = false } = {}) => {
    const shouldUseSilent = silent || hasLoadedOnceRef.current;

    if (!shouldUseSilent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      if (isEntriesSection) {
        if (isDebtSection) {
          const [entriesPayload, summaryPayload] = await Promise.all([
            // Qarzlar sanadan qat'i nazar ko'rsatiladi: o'tgan kunlardagi qarzdorlar ham.
            cashierService.getEntries({ ...effectiveFilters, timeScope: "any", debtOnly: true }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "any", debtOnly: true })
          ]);

          setEntries(entriesPayload?.entries || []);
          setHistoryEntries([]);
          setShiftWindow(
            entriesPayload?.shift || {
              fromLabel: "08:00",
              toLabel: "02:00"
            }
          );
          setSummary(summaryPayload || emptySummary);
        } else if (isHistorySection) {
          const [historyPayload, summaryPayload] = await Promise.all([
            cashierService.getEntries({ ...effectiveFilters, timeScope: "history" }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "history" })
          ]);

          setEntries([]);
          setHistoryEntries(historyPayload?.entries || []);
          setShiftWindow(
            historyPayload?.shift || {
              fromLabel: "08:00",
              toLabel: "02:00"
            }
          );
          setSummary(summaryPayload || emptySummary);
        } else {
          const [activePayload, summaryPayload] = await Promise.all([
            cashierService.getEntries({ ...effectiveFilters, timeScope: "active" }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "active" })
          ]);

          setEntries(activePayload?.entries || []);
          setHistoryEntries([]);
          setShiftWindow(
            activePayload?.shift || {
              fromLabel: "08:00",
              toLabel: "02:00"
            }
          );
          setSummary(summaryPayload || emptySummary);
        }
      } else {
        const [entriesPayload, summaryPayload] = await Promise.all([
          cashierService.getEntries({ ...effectiveFilters, timeScope: "active" }),
          cashierService.getSummary({ ...effectiveFilters, timeScope: "active" })
        ]);

        setEntries(entriesPayload?.entries || []);
        setHistoryEntries([]);
        setShiftWindow(
          entriesPayload?.shift || {
            fromLabel: "08:00",
            toLabel: "02:00"
          }
        );
        setSummary(summaryPayload || emptySummary);
      }
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (!shouldUseSilent) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, [
    effectiveFilters,
    isDebtSection,
    isEntriesSection,
    isHistorySection
  ]);

  const loadSpecialists = async () => {
    try {
      const data = await cashierService.getSpecialists({ type: "all" });
      setSpecialists(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const loadPendingChecks = useCallback(async ({ searchValue = "" } = {}) => {
    if (!isFormSection) {
      setPendingChecks([]);
      return;
    }

    setPendingChecksLoading(true);
    try {
      const data = await cashierService.getPendingChecks({
        role: lockedType || "all",
        search: searchValue
      });
      setPendingChecks(data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPendingChecksLoading(false);
    }
  }, [isFormSection, lockedType]);

  const loadPrinterSettings = useCallback(async ({ silent = false } = {}) => {
    if (!canUseDesktopPrinterSettings()) {
      setPrinterSettings((prev) => ({
        ...prev,
        available: false,
        loading: false,
        saving: false
      }));
      return;
    }

    if (!silent) {
      setPrinterSettings((prev) => ({ ...prev, available: true, loading: true }));
    }

    try {
      const data = await window.sampiDesktop.listPrinters();
      setPrinterSettings((prev) => ({
        ...prev,
        available: true,
        loading: false,
        printers: data?.printers || [],
        selectedPrinterName: data?.selectedPrinterName || "",
        defaultPrinterName: data?.defaultPrinterName || "",
        fallbackPrinterName: data?.fallbackPrinterName || "XP-80"
      }));
    } catch (err) {
      setPrinterSettings((prev) => ({ ...prev, available: true, loading: false }));
      setError(extractErrorMessage(err));
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cashierService.getSettings();
      setSettingsForm(normalizeSettingsForm(data));
      setShiftWindow({
        fromLabel: data?.shiftStartTime || defaultCashierSettings.shiftStartTime,
        toLabel: data?.shiftEndTime || defaultCashierSettings.shiftEndTime
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadLorQueueTicketStatus = useCallback(
    async ({ silent = false, showErrors = true } = {}) => {
      if (!silent) {
        setRefreshing(true);
      }

      try {
        const data = await cashierService.getLorQueueTicketStatus({ lorIdentity: "lor1" });
        setLorTicketStatus({
          nextQueueCode: data?.nextQueueCode || "01",
          lastIssued: data?.lastIssued || null,
          recentIssued: data?.recentIssued || []
        });
        if (data?.lastIssued) {
          setIssuedLorTicket(data.lastIssued);
        }
      } catch (err) {
        if (showErrors) {
          setError(extractErrorMessage(err));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (lockedType) {
      setFilters((prev) => ({
        ...prev,
        department: lockedType,
        specialistType: lockedType
      }));

      setForm((prev) => ({
        ...prev,
        department: lockedType,
        specialistId: ""
      }));
    }
  }, [lockedType]);

  useEffect(() => {
    if (isDebtSection) {
      setFilters((prev) => ({ ...prev, debtOnly: true }));
    }
  }, [isDebtSection]);

  useEffect(() => {
    setFilters(createInitialFilters({ today, lockedType, isDebtSection }));
    setSearchInput("");
    setPendingSearch("");
    setSelectedPendingCheck(null);
    setIssuedLorTicket(null);
    setLorTicketStatus({
      nextQueueCode: "01",
      lastIssued: null,
      recentIssued: []
    });
    setLorPrintEvents([]);
    setSuccess("");
    setError("");
  }, [forcedSection, today, lockedType, isDebtSection]);

  useEffect(() => {
    if (lockedType) return;

    if (filters.department === "lor" && filters.specialistType === "nurse") {
      setFilters((prev) => ({ ...prev, specialistType: "lor" }));
      return;
    }

    if (filters.department === "nurse" && filters.specialistType === "lor") {
      setFilters((prev) => ({ ...prev, specialistType: "nurse" }));
    }
  }, [lockedType, filters.department, filters.specialistType]);

  useEffect(() => {
    if (isLorQueueSection) {
      loadLorQueueTicketStatus();
      return;
    }

    if (isSettingsSection) {
      loadSettings();
    } else if (!isSpecialistSection) {
      loadEntries();
    } else {
      setEntries([]);
      setHistoryEntries([]);
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    isDebtSection,
    isHistorySection,
    isEntriesSection,
    isLorQueueSection,
    isSpecialistSection,
    isSettingsSection,
    effectiveFilters.date,
    effectiveFilters.department,
    effectiveFilters.specialistType,
    effectiveFilters.paymentMethod,
    effectiveFilters.debtOnly,
    effectiveFilters.search,
    loadEntries,
    loadLorQueueTicketStatus,
    loadSettings
  ]);

  useEffect(() => {
    if (isSettingsSection) {
      loadPrinterSettings();
    }
  }, [isSettingsSection, loadPrinterSettings]);

  useEffect(() => {
    loadSpecialists();
  }, []);

  useEffect(() => {
    let active = true;
    let shiftSettings = defaultCashierSettings;
    const refreshToday = () => setToday(getTodayString(shiftSettings));

    cashierService
      .getSettings()
      .then((data) => {
        if (!active || !data) return;
        shiftSettings = data;
        refreshToday();
      })
      .catch(() => {
        // Sozlamalar kelmasa standart smena vaqti bilan davom etamiz.
      });

    const timer = setInterval(refreshToday, SHIFT_DATE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (isFormSection) {
      loadPendingChecks({ searchValue: "" });
      return;
    }

    setPendingChecks([]);
    setPendingSearch("");
    setSelectedPendingCheck(null);
  }, [isFormSection, lockedType, loadPendingChecks]);

  useEffect(() => {
    if (!isFormSection || isPendingCheckMode) {
      return;
    }

    const timer = setTimeout(() => {
      loadPendingChecks({ searchValue: pendingSearch.trim() });
    }, 220);

    return () => clearTimeout(timer);
  }, [isFormSection, isPendingCheckMode, pendingSearch, lockedType, loadPendingChecks]);

  useEffect(() => {
    if (!isEntriesSection) {
      return;
    }

    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
    }, 220);

    return () => clearTimeout(timer);
  }, [isEntriesSection, searchInput]);

  const resetForm = () => {
    setSelectedPendingCheck(null);
    setForm(createInitialForm(lockedType || "lor"));
  };

  const handleFormChange = (key, value) => {
    if (lockedType && key === "department") {
      return;
    }

    if (key === "department") {
      setForm((prev) => ({
        ...prev,
        specialistId: "",
        department: value
      }));
      return;
    }

    if (key === "patientName") {
      setForm((prev) => ({ ...prev, patientName: toTitleCaseName(value) }));
      return;
    }

    if (key === "patientPhone") {
      setForm((prev) => ({ ...prev, patientPhone: formatPhoneInput(value) }));
      return;
    }

    if (key === "amount" || key === "paidAmount") {
      setForm((prev) => {
        const next = { ...prev, [key]: formatMoneyInput(value, 8) };
        // To'langan summa jami summadan oshmaydi (aks holda qarz 0 ko'rinib, server rad etadi).
        const total = Number(String(next.amount || "").replace(/\D/g, "")) || 0;
        const paid = Number(String(next.paidAmount || "").replace(/\D/g, "")) || 0;
        if (total > 0 && paid > total) next.paidAmount = formatMoneyInput(total, 8);
        return next;
      });
      return;
    }

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEntry = async (event) => {
    event.preventDefault();
    resetMessages();
    setSavingEntry(true);

    try {
      const isPendingCheckMode = Boolean(selectedPendingCheck?._id);
      if (!isPendingCheckMode) {
        throw fieldError("cashier-pending", "Avval qabul qilinadigan chekni tanlang.");
      }

      if (String(form.paidAmount || "").trim() === "") {
        throw fieldError("cashier-paid", "To'langan summani kiriting.");
      }

      const paidAmount = safeNumber(form.paidAmount);
      const checkTotal = safeNumber(selectedPendingCheck.total);
      if (paidAmount > checkTotal) {
        throw fieldError("cashier-paid", "To'langan summa chek summasidan oshmasligi kerak.");
      }
      const debtAmount = Math.max(0, checkTotal - paidAmount);
      const shouldRequireDebtPhone = shiftWindow?.settings?.requireDebtPhone !== false;
      if (shouldRequireDebtPhone && debtAmount > 0 && !form.patientPhone.trim()) {
        throw fieldError("cashier-phone", "Qarz qolsa bemor telefoni majburiy.");
      }

      const payload = {
        checkRef: selectedPendingCheck._id,
        paidAmount,
        paymentMethod: form.paymentMethod,
        patientPhone: form.patientPhone.trim(),
        note: form.note.trim()
      };

      await cashierService.createEntry(payload);
      setSuccess("Chek kassada qabul qilindi.");

      resetForm();
      await loadEntries({ silent: true });
      if (isFormSection) {
        await loadPendingChecks({ searchValue: pendingSearch.trim() });
      }
    } catch (err) {
      if (!showFieldErrorFrom(err)) {
        setError(extractErrorMessage(err));
      }
    } finally {
      setSavingEntry(false);
    }
  };

  const handleIssueLorTicket = useCallback(async () => {
    if (issuingLorTicketRef.current) return;

    resetMessages();
    issuingLorTicketRef.current = true;
    setIssuingLorTicket(true);
    const printSession = openPendingPrintTab();
    addLorPrintEvent(
      printSession ? "Print oynasi tayyorlandi." : "Print oynasi bloklandi.",
      printSession ? "info" : "warning"
    );

    try {
      const requestStartedAt = performance.now();
      const ticket = await cashierService.issueLorQueueTicket({ lorIdentity: "lor1" });
      const serverMs = performance.now() - requestStartedAt;
      setIssuedLorTicket(ticket);
      setSuccess(`LOR navbat raqami chiqarildi: ${ticket.queueCode || "-"}.`);
      addLorPrintEvent(`${ticket.queueCode || "-"} raqam serverda yaratildi.`, "success");

      const printed = await writeLorQueueTicketToPrintTab(printSession, ticket);
      if (!printed) {
        setError("Brauzer yangi oynani blokladi. Navbat raqamini ekrandan ham aytish mumkin.");
        addLorPrintEvent("Print yuborilmadi, popup ruxsatini tekshiring.", "warning");
      } else {
        const timings = printed?.timings;
        const seconds = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)}s`;
        addLorPrintEvent(
          timings
            ? `${ticket.queueCode || "-"} raqam printerga yuborildi (server ${seconds(serverMs)}, ` +
                `chek rasmi ${timings.prerendered ? "tayyor edi" : seconds(timings.renderMs)}, ` +
                `Windows'ga topshirish ${seconds(timings.sendMs)}).`
            : `${ticket.queueCode || "-"} raqam printerga yuborildi.`,
          "success"
        );
      }

      setLorTicketStatus((prev) => ({
        ...prev,
        nextQueueCode: getNextQueueCodePreview(ticket.queueCode),
        lastIssued: ticket,
        recentIssued: mergeRecentLorTickets(prev.recentIssued, ticket)
      }));
      loadLorQueueTicketStatus({ silent: true, showErrors: false });
    } catch (err) {
      closePrintTab(printSession);
      const message = extractErrorMessage(err);
      setError(message);
      addLorPrintEvent(`Raqam chiqarishda xato bo'ldi: ${message}`, "error");
    } finally {
      issuingLorTicketRef.current = false;
      setIssuingLorTicket(false);
    }
  }, [addLorPrintEvent, loadLorQueueTicketStatus]);

  // Keyingi raqam chekining rasmi oldindan tayyorlanadi: Enter bosilganda faqat server javobi kutiladi.
  const predictedQueueCode = isLorQueueSection ? lorTicketStatus.nextQueueCode : "";
  useEffect(() => {
    if (!predictedQueueCode) return;
    prerenderLorQueueTicket({ queueCode: predictedQueueCode, lorIdentity: "lor1" });
  }, [predictedQueueCode]);

  const handleReprintIssuedLorTicket = async (ticket = issuedLorTicket) => {
    const targetTicket = ticket || issuedLorTicket;
    if (!targetTicket || reprintingLorTicket) return;

    resetMessages();
    setIssuedLorTicket(targetTicket);
    setReprintingLorTicket(true);
    const printSession = openPendingPrintTab();
    addLorPrintEvent(
      printSession
        ? `${targetTicket.queueCode || "-"} raqam nusxasi tayyorlandi.`
        : "Nusxa uchun print oynasi bloklandi.",
      printSession ? "info" : "warning"
    );

    try {
      const printed = await writeLorQueueTicketToPrintTab(printSession, targetTicket);
      if (!printed) {
        throw new Error("Brauzer yangi oynani blokladi. Pop-up ruxsatini yoqing.");
      }
      addLorPrintEvent(`${targetTicket.queueCode || "-"} raqam nusxasi printerga yuborildi.`, "success");
    } catch (err) {
      closePrintTab(printSession);
      setError(extractErrorMessage(err));
      addLorPrintEvent("Nusxa chiqarishda xato bo'ldi.", "error");
    } finally {
      window.setTimeout(() => setReprintingLorTicket(false), 300);
    }
  };

  useEffect(() => {
    if (!isLorQueueSection) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Enter" || event.repeat || issuingLorTicketRef.current) return;

      const target = event.target;
      const tagName = String(target?.tagName || "").toLowerCase();
      if (target?.isContentEditable || ["input", "textarea", "select", "button"].includes(tagName)) {
        return;
      }

      event.preventDefault();
      handleIssueLorTicket();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLorQueueSection, handleIssueLorTicket]);

  useEffect(() => {
    const desktop = typeof window !== "undefined" ? window.sampiDesktop : null;
    if (!isSettingsSection || typeof desktop?.getWindowSettings !== "function") return;
    desktop
      .getWindowSettings()
      .then((value) => setStartFullscreen(value?.startFullscreen !== false))
      .catch(() => {});
  }, [isSettingsSection]);

  const handleStartFullscreenChange = async (enabled) => {
    const desktop = window.sampiDesktop;
    if (typeof desktop?.setStartFullscreen !== "function") return;
    setStartFullscreen(enabled);
    try {
      const saved = await desktop.setStartFullscreen(enabled);
      setStartFullscreen(saved?.startFullscreen !== false);
      setSuccess(enabled ? "Ilova endi doim to'liq ekranda ochiladi." : "To'liq ekranda ochilish o'chirildi.");
    } catch (err) {
      setStartFullscreen(!enabled);
      setError(extractErrorMessage(err));
    }
  };

  // Terilgan raqam aynan bitta chekka to'liq mos kelsa, uni o'zi ochadi.
  useEffect(() => {
    if (pendingSearch.length !== SHORT_CHECK_ID_LENGTH) return;
    const match = pendingChecks.find((item) => getShortCheckId(item.checkId) === pendingSearch);
    if (match && selectedPendingCheck?._id !== match._id) {
      handlePickPendingCheck(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChecks, pendingSearch]);

  const handlePickPendingCheck = (check) => {
    const roleType = String(check?.creatorRole || "").toLowerCase() === "nurse" ? "nurse" : "lor";
    const roleSpecialists = specialistsByType[roleType] || [];
    const foundSpecialist = roleSpecialists.find((item) => item.name === check.creatorName);

    setSelectedPendingCheck(check);
    setForm({
      department: roleType,
      specialistId: foundSpecialist?._id || "",
      patientName: toTitleCaseName(String(check.patientName || "")),
      amount: formatMoneyInput(check.total, 8),
      paidAmount: "",
      paymentMethod: "cash",
      patientPhone: "",
      note: ""
    });
    resetMessages();
  };

  const clearPendingCheckSelection = () => {
    setSelectedPendingCheck(null);
    resetForm();
  };

  const handleMarkDebtAsPaid = async (entry) => {
    if (!entry?._id) return;

    const currentDebt = safeNumber(entry.debtAmount, 0);
    if (currentDebt <= 0) {
      setSuccess("Bu yozuvda qarz qolmagan.");
      return;
    }

    resetMessages();
    setClosingDebtId(entry._id);

    try {
      await cashierService.payDebt(entry._id, {
        amount: currentDebt,
        paymentMethod: entry.paymentMethod || "cash",
        patientPhone: entry.patientPhone || "",
        note: entry.note || ""
      });

      setSuccess("Qarz to'landi. Yozuv oddiy ro'yxatga o'tdi.");
      await loadEntries({ silent: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setClosingDebtId("");
    }
  };

  const handleAddSpecialist = async () => {
    resetMessages();
    setSavingSpecialist(true);

    try {
      const name = specialistNameInput.trim();
      if (!name) {
        throw fieldError("cashier-specialist-name", "Mutaxassis nomini kiriting.");
      }

      await cashierService.createSpecialist({ type: specialistPageType, name });
      setSpecialistNameInput("");
      setSuccess("Mutaxassis qo'shildi.");
      await loadSpecialists();
    } catch (err) {
      if (!showFieldErrorFrom(err)) {
        setError(extractErrorMessage(err));
      }
    } finally {
      setSavingSpecialist(false);
    }
  };

  const handleSettingsChange = (key, value) => {
    setSettingsForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleReceiptPrinterChange = async (printerName) => {
    if (!canUseDesktopPrinterSettings() || printerSettings.saving) return;

    setError("");
    setSuccess("");
    setPrinterSettings((prev) => ({
      ...prev,
      saving: true,
      selectedPrinterName: printerName
    }));

    try {
      const saved = await window.sampiDesktop.setReceiptPrinter(printerName);
      setPrinterSettings((prev) => ({
        ...prev,
        saving: false,
        selectedPrinterName: saved?.printerName || printerName
      }));
      setSuccess("Chek printeri saqlandi.");
      await loadPrinterSettings({ silent: true });
    } catch (err) {
      setPrinterSettings((prev) => ({ ...prev, saving: false }));
      setError(extractErrorMessage(err));
      await loadPrinterSettings({ silent: true });
    }
  };

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    resetMessages();

    if (!timeInputPattern.test(settingsForm.shiftStartTime)) {
      showFieldError("cashier-shift-start", "Smena boshlanishi HH:mm formatida bo'lishi kerak.");
      return;
    }

    if (!timeInputPattern.test(settingsForm.shiftEndTime)) {
      showFieldError("cashier-shift-end", "Smena tugashi HH:mm formatida bo'lishi kerak.");
      return;
    }

    const lateEntryWarningMinutes = Number(settingsForm.lateEntryWarningMinutes);
    if (
      !Number.isFinite(lateEntryWarningMinutes) ||
      lateEntryWarningMinutes < 0 ||
      lateEntryWarningMinutes > 720
    ) {
      showFieldError("cashier-late-minutes", "Ogohlantirish daqiqasi 0 dan 720 gacha bo'lishi kerak.");
      return;
    }

    setSavingSettings(true);
    try {
      const data = await cashierService.updateSettings({
        shiftStartTime: settingsForm.shiftStartTime,
        shiftEndTime: settingsForm.shiftEndTime,
        lateEntryWarningMinutes,
        requireDebtPhone: settingsForm.requireDebtPhone
      });
      setSettingsForm(normalizeSettingsForm(data));
      setShiftWindow({
        fromLabel: data?.shiftStartTime || defaultCashierSettings.shiftStartTime,
        toLabel: data?.shiftEndTime || defaultCashierSettings.shiftEndTime
      });
      setToday(getTodayString(data || defaultCashierSettings));
      hasLoadedOnceRef.current = false;
      setSuccess("Kassa sozlamalari saqlandi.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return <Spinner page text="Kassa paneli yuklanmoqda..." />;
  }

  if (isLorQueueSection) {
    const nextQueueCode = lorTicketStatus.nextQueueCode || "01";
    const lastIssuedCode = issuedLorTicket?.queueCode || lorTicketStatus.lastIssued?.queueCode || "";
    const recentIssuedTickets = lorTicketStatus.recentIssued || [];
    const latestPrintEvent = lorPrintEvents[0];

    return (
      <div className="space-y-4">
        <PrintingOverlay show={issuingLorTicket} text="Navbat cheki tayyorlanmoqda" />
        <Alert type="success" message={success} />
        <Alert type="error" message={error} />
        <div className="card border-sky-100 bg-white p-4 text-center shadow-sm sm:p-6">
          <div className="mx-auto max-w-2xl">
            <p className="text-sm font-semibold text-slate-500">Keyingi navbat raqami</p>
            <div className="mt-2 flex min-h-36 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 px-4 py-4 sm:min-h-44">
              <span className="text-[5.5rem] font-black leading-none text-slate-950 sm:text-[7.5rem]">
                {nextQueueCode}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-sky-700 sm:text-base">
              <kbd className="rounded border border-sky-200 bg-white px-1.5 py-0.5 text-xs font-bold">Enter</kbd>{" "}
              bosilsa chek darhol chiqadi
            </p>
          </div>

          <div className="mx-auto mt-5 flex max-w-2xl flex-col justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              className="min-h-12 w-full bg-sky-600 px-8 text-base hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              loading={issuingLorTicket}
              loadingText="Chiqarilmoqda..."
              onClick={handleIssueLorTicket}
            >
              Chek chiqarish
            </Button>
          </div>

          {(lastIssuedCode || latestPrintEvent || recentIssuedTickets.length || refreshing) ? (
            <div className="mx-auto mt-5 max-w-3xl rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
              <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                {lastIssuedCode ? (
                  <span>
                    Oxirgi raqam: <b className="text-slate-900">{lastIssuedCode}</b>
                  </span>
                ) : (
                  <span>Hali raqam chiqarilmagan</span>
                )}
                {refreshing ? <span className="font-semibold text-slate-500">Raqam yangilanmoqda...</span> : null}
              </div>

              {latestPrintEvent ? (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    printEventToneClasses[latestPrintEvent.tone] || printEventToneClasses.info
                  }`}
                >
                  <span className="mr-2 opacity-70">{latestPrintEvent.at}</span>
                  {latestPrintEvent.message}
                </div>
              ) : null}

              {recentIssuedTickets.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Tez qayta chiqarish:</span>
                  {recentIssuedTickets.map((ticket) => (
                    <button
                      key={ticket.id || ticket._id || ticket.queueCode}
                      type="button"
                      className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-50"
                      onClick={() => handleReprintIssuedLorTicket(ticket)}
                    >
                      {ticket.queueCode}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (isSettingsSection) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{sectionMeta.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{sectionMeta.subtitle}</p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold tracking-wide text-cyan-800">
              {shiftWindow.fromLabel} - {shiftWindow.toLabel}
            </span>
          </div>
          <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800">
            Bu vaqt joriy yozuvlar, tarix va smena yopish hisobotida ishlatiladi.
          </div>
        </div>

        <form className="card space-y-4 p-4 sm:p-5" onSubmit={handleSaveSettings}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              field="cashier-shift-start"
              label="Smena boshlanishi"
              type="time"
              value={settingsForm.shiftStartTime}
              onChange={(event) => handleSettingsChange("shiftStartTime", event.target.value)}
            />
            <Input
              field="cashier-shift-end"
              label="Smena tugashi"
              type="time"
              value={settingsForm.shiftEndTime}
              onChange={(event) => handleSettingsChange("shiftEndTime", event.target.value)}
            />
            <Input
              field="cashier-late-minutes"
              label="Kechikkan yozuv ogohlantirishi (daqiqa)"
              type="number"
              min="0"
              max="720"
              inputMode="numeric"
              value={settingsForm.lateEntryWarningMinutes}
              onChange={(event) =>
                handleSettingsChange("lateEntryWarningMinutes", event.target.value)
              }
            />
            <label className="flex min-h-[4.25rem] items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5">
              <span>
                <span className="block text-sm font-semibold text-slate-700">
                  Qarzda telefon talab qilish
                </span>
                <span className="mt-0.5 block text-xs font-medium text-slate-500">
                  Qarz yozuvi qolganda telefonni eslatish uchun.
                </span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={settingsForm.requireDebtPhone}
                onChange={(event) =>
                  handleSettingsChange("requireDebtPhone", event.target.checked)
                }
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-600">
            Agar tugash vaqti boshlanishdan kichik bo'lsa, smena ertasi kungacha davom etadi.
            Masalan: 08:00 - 02:00.
          </div>

          <div className="flex justify-end">
            <Button type="submit" className="min-h-12 w-full sm:w-auto" loading={savingSettings}>
              Sozlamalarni saqlash
            </Button>
          </div>
        </form>

        {startFullscreen !== null ? (
          <div className="card p-4 sm:p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={startFullscreen}
                onChange={(event) => handleStartFullscreenChange(event.target.checked)}
              />
              <span>
                <span className="block text-lg font-semibold text-slate-800">
                  Ilova doim to'liq ekranda ochilsin
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  Desktop ilova har ochilganda butun ekranni egallaydi. Vaqtincha chiqish uchun yuqoridagi to'liq
                  ekran tugmasini bosing.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {printerSettings.available ? (
          <div className="card space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Chek printeri</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tanlangan printer navbat va cheklarni bitta bosishda chiqaradi.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                loading={printerSettings.loading}
                disabled={printerSettings.saving}
                onClick={() => loadPrinterSettings()}
              >
                Yangilash
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <SelectMenu
                label="Printer"
                value={printerSettings.selectedPrinterName}
                options={receiptPrinterOptions}
                onChange={handleReceiptPrinterChange}
                disabled={
                  printerSettings.loading ||
                  printerSettings.saving ||
                  receiptPrinterOptions.length === 0
                }
              />
              <Button
                type="button"
                className="min-h-12 w-full md:w-auto"
                loading={printerSettings.saving}
                disabled={
                  printerSettings.loading ||
                  printerSettings.saving ||
                  !printerSettings.selectedPrinterName
                }
                onClick={() => handleReceiptPrinterChange(printerSettings.selectedPrinterName)}
              >
                Printerni saqlash
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-600">
              Hozirgi printer:{" "}
              <strong className="text-slate-800">
                {printerSettings.selectedPrinterName ||
                  `${printerSettings.fallbackPrinterName} (avtomatik)`}
              </strong>
              {printerSettings.defaultPrinterName ? (
                <span className="ml-2 text-slate-500">
                  Windows asosiy: {printerSettings.defaultPrinterName}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />
      </div>
    );
  }

  if (isSpecialistSection) {
    const specialistsData = specialistsByType[specialistPageType] || [];
    const specialistRoleLabel = specialistPageType === "nurse" ? "Hamshira" : "LOR";

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">{specialistRoleLabel} qo'shish</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div data-field="cashier-specialist-name" className="w-full">
              <input
                value={specialistNameInput}
                onChange={(e) => setSpecialistNameInput(e.target.value)}
                placeholder={`Masalan: ${specialistRoleLabel} 1`}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <Button className="w-full sm:w-auto" onClick={handleAddSpecialist} loading={savingSpecialist}>
              Qo'shish
            </Button>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">Ro'yxat</h2>
          <div className="mt-3">
            <Table
              data={specialistsData}
              columns={[
                { key: "name", label: specialistRoleLabel },
                {
                  key: "createdAt",
                  label: "Qo'shilgan sana",
                  render: (row) => formatDateInput(row.createdAt)
                },
                {
                  key: "actions",
                  label: "Amallar",
                  render: () => <span className="text-xs text-slate-400">-</span>
                }
              ]}
            />
          </div>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />
      </div>
    );
  }

  const specialistTitle = lockedType ? sectionMeta.specialistLabel : "Mutaxassis";
  const entryTableHeaderClass =
    lockedType === "nurse"
      ? "bg-rose-100 text-rose-800"
      : lockedType === "lor"
        ? "bg-sky-100 text-sky-800"
        : "bg-slate-100 text-slate-700";

  const entryColumns = [
    { key: "rowNumber", label: "No" },
    ...(lockedType === "lor"
      ? [
          {
            key: "checkLorQueueCode",
            label: "Navbat",
            render: (row) => row.checkLorQueueCode || "-"
          }
        ]
      : []),
    { key: "patientName", label: "F.I.O bemor" },
    {
      key: "amount",
      label: "Summa",
      render: (row) => `${formatCurrency(row.amount)}\u00a0so'm`
    },
    {
      key: "paidAmount",
      label: "To'langan",
      render: (row) => `${formatCurrency(row.paidAmount ?? row.amount)}\u00a0so'm`
    },
    {
      key: "debtAmount",
      label: "Qarz",
      render: (row) => `${formatCurrency(row.debtAmount || 0)}\u00a0so'm`
    },
    {
      key: "paymentMethod",
      label: "To'lov usuli",
      render: (row) => paymentMethodLabels[row.paymentMethod] || row.paymentMethod
    },
    {
      key: "specialistName",
      label: specialistTitle
    },
    {
      key: "patientPhone",
      label: "Tel",
      render: (row) => <span className="whitespace-nowrap">{row.patientPhone || "-"}</span>
    },
    {
      key: "entryDate",
      label: "Sana",
      render: (row) => {
        const [datePart, timePart] = formatShortDateTime(row.createdAt || row.entryDate).split(" ");
        return (
          <span className="block whitespace-nowrap leading-5">
            {datePart}
            {timePart ? <span className="block text-xs text-slate-500">{timePart}</span> : null}
          </span>
        );
      }
    },
    {
      key: "actions",
      label: "Amallar",
      render: (row) =>
        isDebtSection && safeNumber(row.debtAmount, 0) > 0 ? (
          <Button
            type="button"
            className="whitespace-nowrap px-3 py-1.5 text-xs"
            loading={closingDebtId === row._id}
            onClick={() => handleMarkDebtAsPaid(row)}
          >
            To'landi
          </Button>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )
    }
  ];

  const specialistCountValue = isDebtSection
    ? `${summary.totalEntries || 0}`
    : lockedType
      ? `${summary.bySpecialistType?.[lockedType]?.count || 0}`
      : `${summary.bySpecialistType?.nurse?.count || 0} / ${
          summary.bySpecialistType?.lor?.count || 0
        }`;
  const specialistCountTitle = isDebtSection
    ? "Qarzdorlar soni"
    : lockedType
      ? `${departmentLabels[lockedType]} yozuvlari`
      : "Hamshira / LOR";
  const specialistCountHint = isDebtSection
    ? "Qarz qolgan yozuvlar"
    : lockedType
      ? "Joriy ro'yxatdagi mutaxassislar soni"
      : "Mutaxassislar bo'yicha";
  const sectionTheme = isDebtSection
    ? {
        headerCard: "border-amber-200 bg-amber-50/80",
        badge: "bg-amber-100 text-amber-800 border border-amber-200",
        alertBox: "border-amber-200 bg-amber-50 text-amber-800",
        formCard: "",
        submitButton: ""
      }
    : lockedType === "nurse"
      ? {
          headerCard: "border-rose-200 bg-rose-50/70",
          badge: "bg-rose-100 text-rose-800 border border-rose-200",
          alertBox: "border-rose-200 bg-rose-50 text-rose-800",
          formCard: "border-rose-200",
          submitButton: "bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
        }
      : lockedType === "lor"
        ? {
            headerCard: "border-sky-200 bg-sky-50/70",
            badge: "bg-sky-100 text-sky-800 border border-sky-200",
            alertBox: "border-sky-200 bg-sky-50 text-sky-800",
            formCard: "border-sky-200",
            submitButton: "bg-sky-600 hover:bg-sky-700 focus:ring-sky-300"
          }
        : {
            headerCard: "",
            badge: "bg-slate-100 text-slate-700 border border-slate-200",
            alertBox: "border-slate-200 bg-slate-50 text-slate-700",
            formCard: "",
            submitButton: ""
          };
  const sectionWarningText =
    "Bu bo'limda qarzi qolgan yozuvlar chiqadi. To'liq to'langanda \"To'landi\" ni bosing.";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sahifa nomi navbarda turadi; bu yerda faqat foydali izoh qoladi. */}
      {isDebtSection ? (
        <div className={`rounded-xl border px-3 py-2 text-sm font-medium ${sectionTheme.alertBox}`}>
          {sectionWarningText}
        </div>
      ) : null}

      {shouldShowSummaryCards ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Jami summa"
            value={`${formatCurrency(summary.totalAmount)}\u00a0so'm`}
            hint={`Yozuvlar: ${summary.totalEntries}`}
            tone="primary"
          />
          <SummaryCard
            title="To'langan"
            value={`${formatCurrency(summary.totalPaidAmount)}\u00a0so'm`}
            hint="Amalda olingan to'lov"
          />
          <SummaryCard
            title="Qarz"
            value={`${formatCurrency(summary.totalDebtAmount)}\u00a0so'm`}
            hint="Qolgan qarzdorlik"
            tone="accent"
          />
          <SummaryCard
            title={specialistCountTitle}
            value={specialistCountValue}
            hint={specialistCountHint}
          />
        </div>
      ) : null}

      {isFormSection ? (
        <div className="space-y-4 sm:space-y-5">
          <div
            className={`card p-4 sm:p-5 transition-colors duration-150 ${
              isPendingCheckMode ? "border-cyan-300 ring-2 ring-cyan-100" : ""
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Qabul qilinadigan cheklar</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Kassir yangi yozuv yaratmaydi, faqat hamshira yoki LOR yuborgan chekni qabul qiladi.
                </p>
              </div>
              {pendingChecksLoading ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Yuklanmoqda...
                </span>
              ) : null}
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
                isPendingCheckMode
                  ? "pointer-events-none max-h-0 opacity-0"
                  : "mt-3 max-h-[1200px] opacity-100"
              }`}
            >
              {/* Kassir faqat chekdagi "Chek №" ni teradi; to'liq mos chek o'zi ochiladi. */}
              <div className="mt-2" data-field="cashier-pending">
                <label className="block">
                  <span className="sampi-field-label mb-1.5 block text-sm font-semibold text-slate-600">
                    Chek raqami
                  </span>
                  <input
                    value={pendingSearch}
                    onChange={(event) =>
                      setPendingSearch(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^0-9A-Z]/g, "")
                          .slice(0, SHORT_CHECK_ID_LENGTH)
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      const match =
                        pendingChecks.find((item) => getShortCheckId(item.checkId) === pendingSearch) ||
                        (pendingSearch && pendingChecks.length === 1 ? pendingChecks[0] : null);
                      if (match) handlePickPendingCheck(match);
                    }}
                    placeholder="Masalan: B40CFC"
                    autoComplete="off"
                    spellCheck={false}
                    className="sampi-input sampi-control w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-center text-2xl font-black uppercase tracking-[0.35em] text-slate-900 outline-none transition placeholder:text-base placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                </label>
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  Chek pastidagi <b>Chek №</b> ni tering — chek topilishi bilan qabul formasi ochiladi.
                </p>
              </div>

              <div className="mt-3">
                <Table
                  data={pendingChecks}
                  columns={[
                    ...(isLorFormSection
                      ? [
                          {
                            key: "queueCode",
                            label: "Navbat",
                            render: (row) =>
                              row.queueCode ? (
                                <span className="inline-flex min-w-10 justify-center rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">
                                  {row.queueCode}
                                </span>
                              ) : (
                                "-"
                              )
                          }
                        ]
                      : []),
                    {
                      key: "checkId",
                      label: "Chek №",
                      render: (row) => (
                        <span className="sampi-selectable font-mono text-sm font-black tracking-wider text-slate-800">
                          {getShortCheckId(row.checkId) || "-"}
                        </span>
                      )
                    },
                    { key: "patientName", label: "Bemor F.I.O" },
                    {
                      key: "total",
                      label: "Jami summa",
                      render: (row) => `${formatCurrency(row.total)}\u00a0so'm`
                    },
                    {
                      key: "creatorRole",
                      label: "Kim yubordi",
                      render: (row) => (
                        <div>
                          <p>{row.creatorName || "-"}</p>
                          <p className="text-xs text-slate-500">
                            {formatCreatorRoleLabel(row.creatorRole)}
                          </p>
                        </div>
                      )
                    },
                    {
                      key: "createdAt",
                      label: "Yuborilgan vaqt",
                      render: (row) => (
                        <span className="whitespace-nowrap">{formatShortDateTime(row.createdAt)}</span>
                      )
                    },
                    {
                      key: "actions",
                      label: "Amallar",
                      render: (row) => (
                        <Button
                          type="button"
                          className="whitespace-nowrap px-3 py-1.5 text-xs"
                          onClick={() => handlePickPendingCheck(row)}
                        >
                          Qabul qilish
                        </Button>
                      )
                    }
                  ]}
                />
              </div>
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
                isPendingCheckMode
                  ? "mt-3 max-h-80 opacity-100"
                  : "pointer-events-none max-h-0 opacity-0"
              }`}
            >
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-3 text-sm text-cyan-900">
                <p className="font-semibold">Qabul jarayoni boshlandi</p>
                {selectedPendingCheck?.queueCode ? (
                  <p>Navbat: {selectedPendingCheck.queueCode}</p>
                ) : null}
                <p>Bemor: {selectedPendingCheck?.patientName || "-"}</p>
                <p>Jami: {formatCurrency(selectedPendingCheck?.total || 0)} so'm</p>
                <p>Sana: {formatShortDateTime(selectedPendingCheck?.createdAt)}</p>
                <p>
                  {String(selectedPendingCheck?.creatorRole || "").toLowerCase() === "nurse"
                    ? "Hamshira"
                    : "Doktor"}
                  : {selectedPendingCheck?.creatorName || "-"}
                </p>
                {String(selectedPendingCheck?.creatorRole || "").toLowerCase() === "lor" &&
                selectedPendingCheck?.lorIdentity ? (
                  <p>{formatLorIdentityLabel(selectedPendingCheck.lorIdentity)}</p>
                ) : null}
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={clearPendingCheckSelection}
                  >
                    Boshqa chekni tanlash
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`card p-4 sm:p-5 ${sectionTheme.formCard} transition-opacity duration-150 ${
              isPendingCheckMode ? "opacity-100" : "opacity-80"
            }`}
          >
            <h2 className="text-lg font-semibold text-slate-800">Chekni kassada qabul qilish</h2>

            {!isPendingCheckMode ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Avval yuqoridagi ro'yxatdan bitta chek tanlang. Shundan keyin qabul qilish formasi ochiladi.
              </div>
            ) : (
              <form className="mt-4 space-y-3" onSubmit={handleSaveEntry}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs text-slate-500">Bo'lim</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {departmentLabels[lockedType || form.department || "lor"]}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs text-slate-500">Mutaxassis</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedPendingCheck?.creatorName || "-"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Input
                    label="Bemor F.I.O"
                    value={form.patientName}
                    onChange={(e) => handleFormChange("patientName", e.target.value)}
                    placeholder="Masalan: Ali Valiyev"
                    readOnly
                  />
                  <Input
                    label="Jami summa"
                    type="text"
                    inputMode="numeric"
                    maxLength={7}
                    value={form.amount}
                    onChange={(e) => handleFormChange("amount", e.target.value)}
                    placeholder="Masalan: 120 000"
                    readOnly
                  />
                  <div>
                    <Input
                      field="cashier-paid"
                      label="To'langan summa"
                      type="text"
                      inputMode="numeric"
                      maxLength={7}
                      value={form.paidAmount}
                      onChange={(e) => handleFormChange("paidAmount", e.target.value)}
                      placeholder="Masalan: 100 000"
                    />
                    {/* Ko'p bemor to'liq to'laydi: summani qo'lda yozmasdan bitta bosish. */}
                    <button
                      type="button"
                      onClick={() => handleFormChange("paidAmount", form.amount)}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      ✓ To'liq to'landi ({form.amount} so'm)
                    </button>
                  </div>
                  <Input
                    field="cashier-phone"
                    label="Telefon"
                    type="text"
                    inputMode="numeric"
                    maxLength={12}
                    value={form.patientPhone}
                    onChange={(e) => handleFormChange("patientPhone", e.target.value)}
                    placeholder="Masalan: 90 123 45 67"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <SelectMenu
                    label="To'lov usuli"
                    value={form.paymentMethod}
                    options={paymentMethodFormOptions}
                    onChange={(nextValue) => handleFormChange("paymentMethod", nextValue)}
                  />

                  {String(form.paidAmount || "").trim() === "" ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qarz</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">To'langan summani kiriting</p>
                    </div>
                  ) : calculatedDebt > 0 ? (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Qarz qoladi</p>
                      <p className="mt-1 text-lg font-bold text-orange-800">
                        {formatCurrency(calculatedDebt)} so'm
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Qarz</p>
                      <p className="mt-1 text-lg font-bold text-emerald-800">Yo'q — to'liq to'landi</p>
                    </div>
                  )}
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-600">Izoh</span>
                  <textarea
                    value={form.note}
                    onChange={(e) => handleFormChange("note", e.target.value)}
                    rows={2}
                    placeholder="Qo'shimcha izoh (ixtiyoriy)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button
                    type="submit"
                    loading={savingEntry}
                    className={`w-full sm:w-auto ${sectionTheme.submitButton}`}
                  >
                    Chekni qabul qilish
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={clearPendingCheckSelection}
                  >
                    Bekor qilish
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {isEntriesSection ? (
        <>
          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-800">Filtrlar</h2>
            {refreshing ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ma'lumot yangilanmoqda...
              </p>
            ) : null}
            <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
              {isDebtSection
                ? "Barcha kunlardagi ochiq qarzlar ko'rsatiladi. Qarz yopilgach yozuv oddiy ro'yxatga qaytadi."
                : isHistorySection
                ? `${shiftWindow.fromLabel} - ${shiftWindow.toLabel} oralig'idan tashqari yozuvlar tarixi.`
                : `Joriy ro'yxat faqat ${shiftWindow.fromLabel} - ${shiftWindow.toLabel}. Qolgan yozuvlar tarix bo'limida saqlanadi.`}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {!isDebtSection ? (
                <DatePickerField
                  label="Sana"
                  value={filters.date}
                  onChange={(nextDate) => setFilters((prev) => ({ ...prev, date: nextDate || today }))}
                />
              ) : null}

              {!lockedType ? (
                <SelectMenu
                  label="Bo'lim"
                  value={filters.department}
                  options={departmentOptions}
                  onChange={(nextValue) =>
                    setFilters((prev) => {
                      const next = { ...prev, department: nextValue };

                      if (nextValue === "lor" && prev.specialistType === "nurse") {
                        next.specialistType = "lor";
                      } else if (nextValue === "nurse" && prev.specialistType === "lor") {
                        next.specialistType = "nurse";
                      }

                      return next;
                    })
                  }
                />
              ) : null}

              {!lockedType ? (
                <SelectMenu
                  label="Mutaxassis turi"
                  value={filters.specialistType}
                  options={availableSpecialistTypeOptions}
                  onChange={(nextValue) =>
                    setFilters((prev) => ({ ...prev, specialistType: nextValue }))
                  }
                />
              ) : null}

              <SelectMenu
                label="To'lov usuli"
                value={filters.paymentMethod}
                options={paymentMethodOptions}
                onChange={(nextValue) =>
                  setFilters((prev) => ({ ...prev, paymentMethod: nextValue }))
                }
              />

              <label className="flex items-end">
                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isDebtSection ? true : filters.debtOnly}
                    disabled={isDebtSection}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, debtOnly: e.target.checked }))
                    }
                  />
                  {isDebtSection ? "Qarz filtri doim yoqilgan" : "Faqat qarzdorlar"}
                </span>
              </label>
            </div>

            <div className="mt-3">
              <QuickSearchInput
                label="Bemor yoki mutaxassis qidirish"
                placeholder="Bemor yoki mutaxassis bo'yicha qidirish..."
                value={searchInput}
                onChange={setSearchInput}
                items={entrySuggestionItems}
                getItemLabel={(item) => item?.label || ""}
                onPick={(item) => setSearchInput(item?.label || "")}
                emptyText="Mos yozuv topilmadi"
              />
            </div>
          </div>

          {isDebtSection ? (
            <div className="card p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-slate-800">Qarzdorlar ro'yxati</h2>
              <p className="mt-1 text-sm text-slate-500">
                Qarz to'liq yopilganda <strong>To'landi</strong> tugmasini bosing.
              </p>
              <div className="mt-4">
                <Table
                  data={tableData}
                  columns={entryColumns}
                  headerClassName="bg-amber-100 text-amber-900"
                />
              </div>
            </div>
          ) : isCurrentEntriesSection ? (
            <div className="card p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-slate-800">
                Joriy yozuvlar ({shiftWindow.fromLabel} - {shiftWindow.toLabel})
              </h2>
              <div className="mt-4">
                <Table
                  data={tableData}
                  columns={entryColumns}
                  headerClassName={entryTableHeaderClass}
                />
              </div>
            </div>
          ) : (
            <div className="card p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-slate-800">Tarix yozuvlari</h2>
              <p className="mt-1 text-sm text-slate-500">
                {shiftWindow.fromLabel} - {shiftWindow.toLabel} dan tashqari yozuvlar.
              </p>
              <div className="mt-4">
                <Table
                  data={historyTableData}
                  columns={entryColumns}
                  headerClassName="bg-slate-100 text-slate-700"
                />
              </div>
            </div>
          )}
        </>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
    </div>
  );
}

export default CashierDashboard;
