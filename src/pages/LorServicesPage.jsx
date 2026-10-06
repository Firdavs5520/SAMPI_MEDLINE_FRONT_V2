import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
import Modal from "../components/Modal.jsx";
import QuantityStepper from "../components/QuantityStepper.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { fieldError, showFieldErrorFrom } from "../utils/fieldError.js";
import {
  extractErrorMessage,
  formatCurrency,
  splitFullName,
  toTitleCaseName
} from "../utils/format.js";
import {
  closePrintTab,
  openPendingPrintTab,
  writeCheckToPrintTab
} from "../utils/printReceipt.js";

const LOR_LANGUAGE_STORAGE_KEY = "sampi_lor_services_language";

const LANGUAGE_OPTIONS = [
  { id: "uz", label: "UZ", title: "O'zbekcha" },
  { id: "ru", label: "RU", title: "Русский" }
];

const CANCEL_REASON_OPTIONS = [
  { value: "patient_absent", label: "Bemor kelmadi" },
  { value: "wrong_direction", label: "Noto'g'ri yo'naltirilgan" },
  { value: "patient_left", label: "Bemor qaytib ketdi" },
  { value: "other", label: "Boshqa sabab" }
];

const LOR_SERVICE_TEXT = {
  uz: {
    steps: ["1. Navbat", "2. Xizmatlar", "3. Ko'rib chiqish"],
    loading: "LOR xizmatlari yuklanmoqda...",
    loadingAction: "Yuklanmoqda...",
    creatingCheck: "Chek yaratilmoqda...",
    heroTitle: "LOR paneli",
    heroSubtitle: "Chek yaratish kassir chiqargan navbat raqamidan boshlanadi.",
    languageLabel: "Til",
    contextLabel: "Tanlangan ish joyi",
    doctorFallback: "Doktor tanlanmagan",
    switchContext: "Almashtirish",
    patientTitle: "1-qadam: Navbat va bemor F.I.O",
    patientHint: "Avval kassir chiqargan raqamni qabul qiling, keyin bemor ism-familiyasini kiriting.",
    patientLabel: "Bemor F.I.O",
    patientPlaceholder: "Masalan: Ali Valiyev",
    nextServices: "Keyingi: Xizmatlar",
    queueTitle: "Kutilayotgan LOR raqamlari",
    queueEmpty: "Hozircha kutilayotgan navbat yo'q.",
    currentQueue: "Hozirgi qabul",
    callQueue: "Qabul qilish",
    cancelQueue: "Bekor qilish",
    servicesTitle: "2-qadam: Xizmat tanlash",
    serviceSearchLabel: "Xizmat qidirish",
    serviceSearchPlaceholder: "Masalan: Burun chayish",
    serviceSearchEmpty: "Mos xizmat topilmadi",
    noServices: "Hali xizmat yo'q. Avval \"Xizmatlar va narxlar\" bo'limida xizmat yarating.",
    noSearchResults: "Qidiruv bo'yicha xizmat topilmadi.",
    price: "Narx",
    quantity: "Miqdor",
    remove: "Olib tashlash",
    back: "Orqaga",
    nextPreview: "Keyingi: Ko'rib chiqish",
    previewTitle: "3-qadam: Chekni ko'rib chiqish",
    previewHint: "Enter bosib chek chiqaring.",
    doctor: "Doktor",
    patient: "Bemor",
    lorChoice: "LOR tanlovi",
    services: "Xizmatlar",
    noneSelected: "Tanlanmagan",
    total: "Jami",
    needServiceWarning: "Chek chiqarish uchun kamida bitta xizmat tanlanishi kerak.",
    printCheck: "Chek chiqarish (Enter)",
    successCheck: "Chek muvaffaqiyatli yaratildi.",
    popupBlocked: "Brauzer yangi oynani blokladi. Oynaga ruxsatni yoqing.",
    errors: {
      doctorRequired: "Avval LOR va doktorni tanlang.",
      patientRequired: "Bemor F.I.O ni to'liq kiriting (ismi va familiyasi).",
      identityMissing: "LOR tanlovi topilmadi. Qayta kirib chiqing.",
      serviceRequired: "Kamida bitta xizmat tanlang.",
      selectedMissing: "Tanlangan xizmat topilmadi.",
      quantityPositive: "Miqdor 0 dan katta bo'lishi kerak."
    }
  },
  ru: {
    steps: ["1. Пациент", "2. Услуги", "3. Предпросмотр"],
    loading: "Услуги ЛОР загружаются...",
    loadingAction: "Загрузка...",
    creatingCheck: "Чек создается...",
    heroTitle: "Панель ЛОР",
    heroSubtitle: "Создание чека начинается с данных пациента.",
    languageLabel: "Язык",
    contextLabel: "Выбранное рабочее место",
    doctorFallback: "Доктор не выбран",
    switchContext: "Сменить",
    patientTitle: "Шаг 1: Ф.И.О. пациента",
    patientHint: "Доктор уже выбран. Введите имя и фамилию пациента.",
    patientLabel: "Ф.И.О. пациента",
    patientPlaceholder: "Например: Али Валиев",
    nextServices: "Далее: Услуги",
    servicesTitle: "Шаг 2: Выбор услуги",
    serviceSearchLabel: "Поиск услуги",
    serviceSearchPlaceholder: "Например: Промывание носа",
    serviceSearchEmpty: "Подходящая услуга не найдена",
    noServices: "Услуг пока нет. Сначала создайте услугу в разделе \"Добавить услугу\".",
    noSearchResults: "По запросу услуга не найдена.",
    price: "Цена",
    quantity: "Количество",
    remove: "Убрать",
    back: "Назад",
    nextPreview: "Далее: Предпросмотр",
    previewTitle: "Шаг 3: Предпросмотр чека",
    previewHint: "Нажмите Enter, чтобы распечатать чек.",
    doctor: "Доктор",
    patient: "Пациент",
    lorChoice: "Выбор ЛОР",
    services: "Услуги",
    noneSelected: "Не выбрано",
    total: "Итого",
    needServiceWarning: "Для печати чека нужно выбрать хотя бы одну услугу.",
    printCheck: "Распечатать чек (Enter)",
    successCheck: "Чек успешно создан.",
    popupBlocked: "Браузер заблокировал новое окно. Разрешите открытие окна.",
    errors: {
      doctorRequired: "Сначала выберите ЛОР и доктора.",
      patientRequired: "Введите полное Ф.И.О. пациента (имя и фамилию).",
      identityMissing: "Выбор ЛОР не найден. Выйдите и войдите заново.",
      serviceRequired: "Выберите хотя бы одну услугу.",
      selectedMissing: "Выбранная услуга не найдена.",
      quantityPositive: "Количество должно быть больше 0."
    }
  }
};

const LOR_SERVICE_NAME_TRANSLATIONS = [
  {
    ru: "Промывание И Удаление Серных Пробок Из Ушей",
    uz: "Quloq kiri tiqinlarini yuvish va olib tashlash"
  },
  {
    ru: "Промывание Лакун. Миндалины",
    uz: "Murtak lakunalarini yuvish"
  },
  {
    ru: "Промывание Лакун Миндалины",
    uz: "Murtak lakunalarini yuvish"
  },
  {
    ru: "Промывание Онп По Проецу",
    uz: "Burun yondosh bo'shliqlarini Proets usulida yuvish"
  },
  {
    ru: "Промывание ОНП По Проецу",
    uz: "Burun yondosh bo'shliqlarini Proets usulida yuvish"
  },
  {
    ru: "Промывание ОНП По Проетцу",
    uz: "Burun yondosh bo'shliqlarini Proets usulida yuvish"
  },
  {
    ru: "Пункция Верхнечелюстной Пазухи С Одной Стороны",
    uz: "Bir tomondan yuqori jag' bo'shlig'ini punksiya qilish"
  },
  {
    ru: "Смена Трахеостомической Трубки",
    uz: "Traxeostomik naychani almashtirish"
  },
  {
    ru: "Удаление Инородного Тела Из Лор Органов",
    uz: "LOR organlaridan yot jismni olib tashlash"
  },
  {
    ru: "Уход За Больным В Послеоперационном Периоде",
    uz: "Operatsiyadan keyingi davrda bemorni parvarish qilish"
  },
  {
    ru: "Введение Лекарственных Средств В Ухо",
    uz: "Quloqqa dori vositalarini kiritish"
  },
  {
    ru: "Зондирование Лобной Пазухи С Одной Стороны",
    uz: "Bir tomondan peshona bo'shlig'ini zondlash"
  },
  {
    ru: "Ингаляция",
    uz: "Ingalyatsiya"
  },
  {
    ru: "Компресс В Ухо",
    uz: "Quloqqa kompress"
  },
  {
    ru: "Консультация",
    uz: "Konsultatsiya"
  },
  {
    ru: "Лимфотропное Введение Лекарственных Средств",
    uz: "Limfotrop dori vositalarini kiritish"
  },
  {
    ru: "Обработка Полости Рта",
    uz: "Og'iz bo'shlig'iga ishlov berish"
  },
  {
    ru: "Осмотр Пациента В Динамике (2 Недель)",
    uz: "Bemorni dinamik kuzatish (2 hafta)"
  },
  {
    ru: "Продувание По Политцеру",
    uz: "Politser bo'yicha puflash"
  }
];

const normalizeServiceNameKey = (value) =>
  String(value || "")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();

const LOR_SERVICE_NAME_TRANSLATION_MAP = LOR_SERVICE_NAME_TRANSLATIONS.reduce(
  (map, translation) => {
    map.set(normalizeServiceNameKey(translation.ru), translation);
    map.set(normalizeServiceNameKey(translation.uz), translation);
    return map;
  },
  new Map()
);

const getDisplayServiceName = (service, language) => {
  const originalName = String(service?.name || "");
  const translation = LOR_SERVICE_NAME_TRANSLATION_MAP.get(normalizeServiceNameKey(originalName));
  return translation?.[language] || originalName;
};

const getServiceNameSearchValues = (service, language) => {
  const originalName = String(service?.name || "");
  const translation = LOR_SERVICE_NAME_TRANSLATION_MAP.get(normalizeServiceNameKey(originalName));

  return Array.from(
    new Set(
      [
        getDisplayServiceName(service, language),
        originalName,
        translation?.uz,
        translation?.ru
      ].filter(Boolean)
    )
  );
};

const isSupportedLanguage = (value) => LANGUAGE_OPTIONS.some((option) => option.id === value);

const getDoctorLanguageStorageKey = (doctorId) => {
  const safeDoctorId = String(doctorId || "").trim();
  return safeDoctorId
    ? `${LOR_LANGUAGE_STORAGE_KEY}:${safeDoctorId}`
    : LOR_LANGUAGE_STORAGE_KEY;
};

const getStoredLanguage = (doctorId) => {
  if (typeof window === "undefined") return "uz";

  try {
    const storedLanguage = window.localStorage.getItem(getDoctorLanguageStorageKey(doctorId));
    return isSupportedLanguage(storedLanguage) ? storedLanguage : "uz";
  } catch {
    return "uz";
  }
};

const saveStoredLanguage = (language, doctorId) => {
  if (typeof window === "undefined" || !isSupportedLanguage(language)) return;

  try {
    window.localStorage.setItem(getDoctorLanguageStorageKey(doctorId), language);
  } catch {
    // no-op
  }
};

const normalizeSearch = (value, language = "uz") =>
  String(value ?? "")
    .toLocaleLowerCase(language === "ru" ? "ru-RU" : "uz-UZ")
    .trim();

const safeQty = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.max(1, Math.floor(n)));
};

function LorServicesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, lorIdentity, lorDoctor } = useAuth();
  const [language, setLanguage] = useState(() => getStoredLanguage(lorDoctor?.id));
  const text = LOR_SERVICE_TEXT.uz;

  const [loading, setLoading] = useState(true);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [callingTicketId, setCallingTicketId] = useState("");
  const [cancelingTicket, setCancelingTicket] = useState(false);
  const [cancelPromptOpen, setCancelPromptOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASON_OPTIONS[0].value);
  const [cancelNote, setCancelNote] = useState("");

  const [services, setServices] = useState([]);
  const [queueState, setQueueState] = useState({ current: null, waiting: [] });
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [serviceInputs, setServiceInputs] = useState({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [patient, setPatient] = useState({ fullName: "" });
  // "Mening cheklarim" dan "Qayta qabul qilish" bosilganda kelgan bemor ma'lumoti.
  const [pendingReadmit, setPendingReadmit] = useState(() => location.state?.readmit || null);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Qidiruvda Enter bosilganda qaysi xizmat qo'shilishi ekranda aniq ko'rinadi.
  const [highlightIndex, setHighlightIndex] = useState(0);
  // Yangi qo'shilgan xizmat chekda bir lahza ajralib turadi (xato tanlov darhol ko'rinadi).
  const [recentlyAddedId, setRecentlyAddedId] = useState("");

  const patientInputRef = useRef(null);
  const serviceSearchRef = useRef(null);
  const serviceListRef = useRef(null);
  const previewListRef = useRef(null);
  const checkoutShortcutRef = useRef(null);
  const activeTicket = queueState.current;
  const waitingTickets = queueState.waiting || [];

  const sortedServices = useMemo(
    () =>
      [...services].sort((a, b) =>
        getDisplayServiceName(a, language).localeCompare(
          getDisplayServiceName(b, language),
          language === "ru" ? "ru" : "uz"
        )
      ),
    [services, language]
  );

  const filteredServices = useMemo(() => {
    const query = normalizeSearch(serviceSearch, language);
    if (!query) return sortedServices;

    return sortedServices.filter((service) =>
      getServiceNameSearchValues(service, language).some((name) =>
        normalizeSearch(name, language).includes(query)
      )
    );
  }, [serviceSearch, sortedServices, language]);

  const previewServices = useMemo(
    () =>
      selectedServiceIds
        .map((serviceId) => {
          const service = sortedServices.find((item) => item._id === serviceId);
          if (!service) return null;
          const quantity = Number(serviceInputs[serviceId]?.quantity || 1);
          const lineTotal = quantity * Number(service.price || 0);

          return {
            id: serviceId,
            name: getDisplayServiceName(service, language),
            quantity,
            lineTotal
          };
        })
        .filter(Boolean),
    [selectedServiceIds, sortedServices, serviceInputs, language]
  );

  const previewTotal = useMemo(
    () => previewServices.reduce((sum, item) => sum + item.lineTotal, 0),
    [previewServices]
  );

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentUserId = String(user?.id || user?._id || "");
      const allServices = await serviceService.getAllServices();

      setServices(
        allServices.filter(
          (item) =>
            item.type === "lor" &&
            (!item.createdBy?.userId || String(item.createdBy.userId) === currentUserId)
        )
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?._id]);

  const loadLorQueueTickets = useCallback(
    async ({ silent = false } = {}) => {
      if (!lorIdentity) {
        setQueueState({ current: null, waiting: [] });
        return;
      }

      if (!silent) {
        setQueueLoading(true);
      }

      try {
        const data = await usageService.getLorQueueTickets({ lorIdentity });
        setQueueState({
          current: data?.current || null,
          waiting: data?.waiting || []
        });
      } catch (err) {
        if (!silent) {
          setError(extractErrorMessage(err));
        }
      } finally {
        if (!silent) {
          setQueueLoading(false);
        }
      }
    },
    [lorIdentity]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLorQueueTickets();
    const timer = setInterval(() => {
      loadLorQueueTickets({ silent: true });
    }, 4000);

    return () => clearInterval(timer);
  }, [loadLorQueueTickets]);

  useEffect(() => {
    setLanguage(getStoredLanguage(lorDoctor?.id));
  }, [lorDoctor?.id]);

  // Navbat qabul qilinganda kursor darhol bemor F.I.O maydoniga tushadi.
  const activeTicketId = activeTicket?.id || "";

  // Sahifa yangilanganda qayta qabul ikkinchi marta qo'llanmasligi uchun.
  useEffect(() => {
    if (location.state?.readmit) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  // Navbat raqami qabul qilingach (va hali hech narsa kiritilmagan bo'lsa)
  // bemor ismi va o'tgan safargi xizmatlar o'zi to'ladi.
  useEffect(() => {
    if (!pendingReadmit || !activeTicketId || !sortedServices.length) return;
    if (patient.fullName.trim() || selectedServiceIds.length) return;

    const byName = new Map(sortedServices.map((service) => [service.name, service]));
    const matched = pendingReadmit.items
      .map((item) => ({ service: byName.get(item.name), quantity: item.quantity }))
      .filter((item) => item.service);

    setPatient({ fullName: pendingReadmit.patientName });
    setSelectedServiceIds(matched.map((item) => item.service._id));
    setServiceInputs(
      Object.fromEntries(
        matched.map((item) => [item.service._id, { quantity: String(Math.max(1, item.quantity || 1)) }])
      )
    );
    const missing = pendingReadmit.items.length - matched.length;
    setSuccess(
      missing > 0
        ? `Qayta qabul: ma'lumotlar to'ldirildi. ${missing} ta xizmat endi ro'yxatda yo'q.`
        : "Qayta qabul: bemor va o'tgan safargi xizmatlar to'ldirildi. Kerak bo'lsa o'zgartiring."
    );
    setPendingReadmit(null);
  }, [pendingReadmit, activeTicketId, sortedServices, patient.fullName, selectedServiceIds.length]);
  useEffect(() => {
    if (activeTicketId) {
      setTimeout(() => patientInputRef.current?.focus?.(), 0);
    }
  }, [activeTicketId]);

  useEffect(() => {
    setSelectedServiceIds((prev) =>
      prev.filter((id) => sortedServices.some((item) => item._id === id))
    );
  }, [sortedServices]);

  const validateDoctor = () => {
    if (!lorDoctor?.id || !lorDoctor?.name) {
      throw new Error(text.errors.doctorRequired);
    }
  };

  const validatePatient = () => {
    const normalizedPatient = splitFullName(patient.fullName);
    const firstName = normalizedPatient.firstName.trim();
    const lastName = normalizedPatient.lastName.trim();

    if (!firstName || !lastName) {
      throw fieldError("lor-patient", text.errors.patientRequired);
    }
  };

  const toggleService = (serviceId) => {
    if (selectedServiceIds.includes(serviceId)) {
      setSelectedServiceIds((prev) => prev.filter((id) => id !== serviceId));
      return;
    }

    setServiceInputs((prevInputs) => ({
      ...prevInputs,
      [serviceId]: {
        quantity: prevInputs[serviceId]?.quantity || "1"
      }
    }));
    setSelectedServiceIds((prev) => (prev.includes(serviceId) ? prev : [...prev, serviceId]));
    setRecentlyAddedId(serviceId);
  };

  useEffect(() => {
    if (!recentlyAddedId) return undefined;

    previewListRef.current
      ?.querySelector(`[data-preview-id="${recentlyAddedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const timer = setTimeout(() => setRecentlyAddedId(""), 1600);
    return () => clearTimeout(timer);
  }, [recentlyAddedId]);

  const updateServiceQuantity = (serviceId, value) => {
    setServiceInputs((prev) => ({
      ...prev,
      [serviceId]: {
        quantity: safeQty(value)
      }
    }));
  };

  const changeLorContext = () => {
    if (activeTicket?.id) {
      resetMessages();
      setError("Avval hozirgi LOR navbatini yakunlang yoki bekor qiling.");
      return;
    }

    navigate("/lor/select", { state: { from: location } });
  };

  const handleLanguageChange = (nextLanguage) => {
    if (!isSupportedLanguage(nextLanguage)) return;
    setLanguage(nextLanguage);
    saveStoredLanguage(nextLanguage, lorDoctor?.id);
  };

  const handleCreateCheckout = async () => {
    if (submittingCheckout) return;
    resetMessages();
    setSubmittingCheckout(true);
    let printTab = null;

    try {
      validateDoctor();

      validatePatient();

      if (!lorIdentity) {
        throw new Error(text.errors.identityMissing);
      }

      if (!activeTicket?.id) {
        throw new Error("Avval kassir chiqargan LOR raqamni qabul qiling.");
      }

      if (selectedServiceIds.length === 0) {
        throw fieldError("lor-services", text.errors.serviceRequired);
      }

      const normalizedPatient = splitFullName(patient.fullName);
      const firstName = normalizedPatient.firstName.trim();
      const lastName = normalizedPatient.lastName.trim();

      const servicesPayload = selectedServiceIds.map((serviceId) => {
        const service = sortedServices.find((item) => item._id === serviceId);
        if (!service) {
          throw new Error(text.errors.selectedMissing);
        }
        const quantity = Number(serviceInputs[serviceId]?.quantity || 1);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(text.errors.quantityPositive);
        }

        return {
          serviceId,
          quantity
        };
      });

      printTab = openPendingPrintTab();
      const result = await usageService.createLorCheckout({
        services: servicesPayload,
        lorIdentity,
        specialistId: lorDoctor.id,
        specialistName: lorDoctor.name,
        queueTicketId: activeTicket.id,
        patient: {
          firstName,
          lastName
        }
      });

      setSuccess(text.successCheck);
      setPatient({ fullName: "" });
      setSelectedServiceIds([]);
      setServiceInputs({});
      setServiceSearch("");
      setQueueState({ current: null, waiting: [] });
      window.scrollTo({ top: 0, behavior: "smooth" });
      await loadLorQueueTickets({ silent: true });

      const written = await writeCheckToPrintTab(printTab, result.check);
      if (!written) {
        setError(text.popupBlocked);
      }
    } catch (err) {
      closePrintTab(printTab);
      if (!showFieldErrorFrom(err)) {
        setError(extractErrorMessage(err));
      }
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleCallTicket = async (ticket) => {
    if (!ticket?.id || callingTicketId) return;

    resetMessages();
    setCallingTicketId(ticket.id);

    try {
      validateDoctor();

      if (!lorIdentity) {
        throw new Error(text.errors.identityMissing);
      }

      const currentTicket = await usageService.callLorQueueTicket(ticket.id, {
        lorIdentity,
        specialistId: lorDoctor.id,
        specialistName: lorDoctor.name
      });

      setQueueState((prev) => ({
        current: currentTicket,
        waiting: (prev.waiting || []).filter((item) => item.id !== ticket.id)
      }));
      setPatient({ fullName: currentTicket?.patient?.fullName || "" });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCallingTicketId("");
    }
  };

  const handleCancelActiveTicket = async () => {
    if (!activeTicket?.id || cancelingTicket) return;

    resetMessages();
    setCancelingTicket(true);

    try {
      await usageService.cancelLorQueueTicket(activeTicket.id, {
        lorIdentity,
        reason: cancelReason,
        note: cancelNote
      });
      setPatient({ fullName: "" });
      setSelectedServiceIds([]);
      setServiceInputs({});
      setServiceSearch("");
      setCancelPromptOpen(false);
      setCancelReason(CANCEL_REASON_OPTIONS[0].value);
      setCancelNote("");
      await loadLorQueueTickets({ silent: true });
      setSuccess("LOR navbati bekor qilindi.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCancelingTicket(false);
    }
  };

  const moveHighlight = (nextIndex) => {
    const safeIndex = Math.max(0, Math.min(nextIndex, filteredServices.length - 1));
    setHighlightIndex(safeIndex);
    serviceListRef.current
      ?.querySelector(`[data-service-index="${safeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  // Qidiruv: ↑/↓ bilan ajratilgan xizmat o'zgaradi, Enter faqat ekranda
  // ajratib ko'rsatilgan xizmatni qo'shadi (ko'rinmas "birinchisini" emas).
  const handleServiceSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      setServiceSearch("");
      setHighlightIndex(0);
      return;
    }

    if (!serviceSearch.trim()) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(highlightIndex + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }

    if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const target = filteredServices[highlightIndex];
    if (!target) return;
    if (!selectedServiceIds.includes(target._id)) toggleService(target._id);
    setServiceSearch("");
    setHighlightIndex(0);
  };

  checkoutShortcutRef.current = handleCreateCheckout;
  const hasActiveTicket = Boolean(activeTicket?.id);

  // Ctrl+Enter — istalgan joydan chek chiqarish.
  useEffect(() => {
    if (!hasActiveTicket) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.repeat) {
        event.preventDefault();
        checkoutShortcutRef.current?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasActiveTicket]);

  if (loading) {
    return <Spinner text={text.loading} />;
  }

  return (
    // Navbat qabul qilinganda pastki panel ekran tagiga yopishishi uchun main ning
    // pastki paddingi yopiladi (aks holda sahifa oxirida panel 16-24px ko'tariladi).
    <div className={`space-y-4 overflow-x-clip ${activeTicket ? "-mb-4 lg:-mb-6" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
          <span className="truncate">
            {text.doctor}: <b className="text-slate-900">{lorDoctor?.name || text.doctorFallback}</b>
          </span>
          <Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs" onClick={changeLorContext}>
            {text.switchContext}
          </Button>
        </div>
        <div
          className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
          aria-label="Xizmat nomlari tili"
        >
          <span className="px-2 text-[11px] font-semibold text-slate-500">Xizmat nomlari</span>
          {LANGUAGE_OPTIONS.map((option) => {
            const active = option.id === language;
            return (
              <button
                key={option.id}
                type="button"
                title={option.title}
                aria-pressed={active}
                onClick={() => handleLanguageChange(option.id)}
                className={`min-w-10 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active ? "bg-cyan-700 text-white shadow-sm" : "text-slate-600 hover:bg-cyan-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      {pendingReadmit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3">
          <div className="min-w-0 text-sm text-sky-900">
            <p className="font-bold">Qayta qabul: {pendingReadmit.patientName || "bemor"}</p>
            <p className="text-sky-800">
              {activeTicket
                ? "Avval hozirgi bemorni yakunlang. Keyingi navbat raqami qabul qilinganda ma'lumotlar o'zi to'ladi."
                : "Navbat raqamini qabul qiling: bemor ismi va o'tgan safargi xizmatlar o'zi to'ladi."}
            </p>
          </div>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setPendingReadmit(null)}>
            Bekor qilish
          </Button>
        </div>
      ) : null}

      {!activeTicket ? (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{text.queueTitle}</h2>
              <p className="text-sm text-slate-500">Bemorni qabul qilish uchun uning raqamini bosing.</p>
            </div>
            {queueLoading ? (
              <span className="text-xs font-semibold text-slate-500">Yuklanmoqda...</span>
            ) : null}
          </div>

          {waitingTickets.length ? (
            // Raqamlar ustun bo'ylab ketadi: 01, 02, 03 pastga, keyin keyingi ustun.
            <div className="mt-4 gap-2 sm:columns-2 xl:columns-3">
              {waitingTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => handleCallTicket(ticket)}
                  disabled={Boolean(callingTicketId)}
                  className="mb-2 flex w-full break-inside-avoid items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-sky-400 disabled:cursor-wait disabled:opacity-70"
                >
                  <span className="text-3xl font-black leading-none text-slate-900">
                    {ticket.queueCode}
                  </span>
                  <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">
                    {callingTicketId === ticket.id ? "..." : text.callQueue}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm font-semibold text-slate-500">
              {text.queueEmpty}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card grid gap-3 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
            <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2">
              <span className="text-xs font-semibold text-sky-700">Navbat</span>
              <span className="text-4xl font-black leading-none text-slate-900">
                {activeTicket.queueCode || "--"}
              </span>
            </div>
            <Input
              field="lor-patient"
              label={text.patientLabel}
              value={patient.fullName}
              placeholder={text.patientPlaceholder}
              inputRef={patientInputRef}
              onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  serviceSearchRef.current?.focus();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={cancelingTicket}
              loadingText="Bekor qilinmoqda..."
              onClick={() => setCancelPromptOpen(true)}
            >
              Navbatni bekor qilish
            </Button>
            {waitingTickets.length ? (
              <p className="text-xs font-semibold text-amber-700 md:col-span-3">
                Yana {waitingTickets.length} ta bemor kutmoqda. Ularni bu bemorni yakunlagandan keyin qabul qilasiz.
              </p>
            ) : null}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="card p-4">
              <div data-field="lor-services">
                <input
                  ref={serviceSearchRef}
                  type="search"
                  value={serviceSearch}
                  onChange={(e) => {
                    setServiceSearch(e.target.value);
                    setHighlightIndex(0);
                  }}
                  onKeyDown={handleServiceSearchKeyDown}
                  placeholder="Xizmat qidirish... (↑ ↓ tanlash, Enter — qo'shish, Esc — tozalash)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              {sortedServices.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  {text.noServices}
                </p>
              ) : null}

              {/* Ro'yxat emas, plitkalar: barcha xizmatlar bir ekranda, bitta bosish bilan qo'shiladi.
                  Tartib doim alifbo bo'yicha, shuning uchun har bir xizmat o'z joyida qoladi. */}
              <div
                ref={serviceListRef}
                className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2"
              >
                {filteredServices.map((service, index) => {
                  const selected = selectedServiceIds.includes(service._id);
                  const highlighted = Boolean(serviceSearch.trim()) && index === highlightIndex;
                  const quantity = Number(serviceInputs[service._id]?.quantity || 1);
                  return (
                    <button
                      key={service._id}
                      type="button"
                      data-service-index={index}
                      aria-pressed={selected}
                      onClick={() => toggleService(service._id)}
                      onMouseEnter={() => serviceSearch.trim() && setHighlightIndex(index)}
                      className={`relative flex min-h-[84px] flex-col justify-between rounded-xl border-2 px-4 py-3 text-left transition active:scale-[0.98] ${
                        selected
                          ? "border-primary bg-cyan-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      } ${highlighted ? "ring-4 ring-amber-300" : ""}`}
                    >
                      <span className="break-words pr-8 text-base font-semibold leading-snug text-slate-900">
                        {getDisplayServiceName(service, language)}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className="whitespace-nowrap text-sm font-bold text-slate-600">
                          {service.price ? `${formatCurrency(service.price)} so'm` : "Bepul"}
                        </span>
                        {highlighted ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                            {selected ? "Tanlangan" : "Enter"}
                          </span>
                        ) : null}
                      </span>
                      {selected ? (
                        <span
                          className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-black text-white"
                          aria-hidden="true"
                        >
                          {quantity > 1 ? `×${quantity}` : "✓"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {sortedServices.length > 0 && filteredServices.length === 0 ? (
                  <p className="col-span-full px-3 py-8 text-center text-sm font-semibold text-slate-500">
                    {text.noSearchResults}
                  </p>
                ) : null}
              </div>
            </section>

            <aside className="card p-4 lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Tanlangan xizmatlar</h2>
                <span className="text-xs font-semibold text-slate-500">
                  {selectedServiceIds.length} ta
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Oxirgi qo'shilgani tepada</p>

              {/* Ro'yxat o'zi aylanadi; chek tugmasi pastki panelda doim ko'rinadi. */}
              <div
                ref={previewListRef}
                className="mt-3 space-y-2 lg:max-h-[calc(100dvh-22rem)] lg:overflow-y-auto lg:pr-1"
              >
                {[...previewServices].reverse().map((line) => (
                  <div
                    key={line.id}
                    data-preview-id={line.id}
                    className={`rounded-lg border px-3 py-2 transition-colors duration-500 ${
                      line.id === recentlyAddedId
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold text-slate-800">{line.name}</p>
                      <button
                        type="button"
                        aria-label={text.remove}
                        onClick={() => toggleService(line.id)}
                        className="shrink-0 text-lg leading-none text-slate-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(next) => updateServiceQuantity(line.id, next)}
                      />
                      <span className="whitespace-nowrap text-sm font-bold text-slate-800">
                        {formatCurrency(line.lineTotal)}{"\u00a0"}so'm
                      </span>
                    </div>
                  </div>
                ))}
                {!previewServices.length ? (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                    Chapdan xizmat tanlang
                  </p>
                ) : null}
              </div>
            </aside>
          </div>

          {/* Ekran tagiga yopishgan: sahifa qayerda bo'lmasin bir xil joyda turadi. */}
          <div className="sticky bottom-0 z-30 rounded-t-xl border border-b-0 border-slate-200 bg-white p-3 shadow-[0_-6px_24px_rgba(15,23,42,0.12)] sm:p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="shrink-0 rounded-lg bg-sky-50 px-3 py-1 text-2xl font-black leading-none text-slate-900">
                  {activeTicket.queueCode || "--"}
                </span>
                <div className="min-w-0">
                  {patient.fullName.trim() ? (
                    <p className="truncate text-sm font-bold text-slate-900">{patient.fullName}</p>
                  ) : (
                    <p className="truncate text-sm font-bold text-amber-700">Bemor F.I.O kiritilmagan</p>
                  )}
                  <p className="text-xs font-semibold text-slate-500">
                    {selectedServiceIds.length} ta xizmat tanlangan
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-500">{text.total}</p>
                <p className="whitespace-nowrap text-2xl font-black leading-tight text-slate-900">
                  {formatCurrency(previewTotal)}{"\u00a0"}so'm
                </p>
              </div>
              <Button
                className="min-h-12 w-full bg-sky-600 text-base hover:bg-sky-700 focus:ring-sky-300 sm:w-auto sm:min-w-60"
                loading={submittingCheckout}
                loadingText={text.loadingAction}
                disabled={!selectedServiceIds.length}
                onClick={handleCreateCheckout}
                title="Ctrl + Enter"
              >
                Chek chiqarish
                <span className="ml-2 hidden rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold lg:inline">
                  Ctrl+Enter
                </span>
              </Button>
            </div>
            {error ? <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p> : null}
          </div>
        </>
      )}

      <Modal
        open={cancelPromptOpen}
        title="Navbatni bekor qilish"
        panelClassName="max-w-md"
        onClose={() => {
          if (!cancelingTicket) {
            setCancelPromptOpen(false);
          }
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={cancelingTicket}
              onClick={() => setCancelPromptOpen(false)}
            >
              Orqaga
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={cancelingTicket}
              loadingText="Bekor qilinmoqda..."
              onClick={handleCancelActiveTicket}
            >
              Bekor qilish
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            {activeTicket?.queueCode || "--"} raqamli navbat bekor qilinadi. Bu amal TVdan raqamni olib tashlaydi.
          </div>
          <div className="grid gap-2">
            {CANCEL_REASON_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-bold transition-colors ${
                  cancelReason === option.value
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-sky-200"
                }`}
              >
                <input
                  type="radio"
                  name="lor-cancel-reason"
                  value={option.value}
                  checked={cancelReason === option.value}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <label className="block">
            <span className="sampi-field-label mb-1.5 block text-sm font-semibold">
              Izoh
            </span>
            <textarea
              className="sampi-input sampi-control min-h-20 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition"
              maxLength={200}
              value={cancelNote}
              onChange={(event) => setCancelNote(event.target.value)}
              placeholder="Ixtiyoriy"
            />
          </label>
        </div>
      </Modal>
      <BusyOverlay show={submittingCheckout} text={text.creatingCheck} />
    </div>
  );
}

export default LorServicesPage;
