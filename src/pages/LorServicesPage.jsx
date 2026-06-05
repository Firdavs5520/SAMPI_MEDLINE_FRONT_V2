import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
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

const LOR_SERVICE_TEXT = {
  uz: {
    steps: ["1. Bemor", "2. Xizmatlar", "3. Chek preview"],
    loading: "LOR xizmatlari yuklanmoqda...",
    loadingAction: "Yuklanmoqda...",
    creatingCheck: "Chek yaratilmoqda...",
    heroTitle: "LOR paneli",
    heroSubtitle: "Chek yaratish endi bemordan boshlanadi.",
    languageLabel: "Til",
    contextLabel: "Tanlangan ish joyi",
    doctorFallback: "Doktor tanlanmagan",
    switchContext: "Almashtirish",
    patientTitle: "1-qadam: Bemor F.I.O",
    patientHint: "Doktor allaqachon tanlangan. Endi bemor ism-familiyasini kiriting.",
    patientLabel: "Bemor F.I.O",
    patientPlaceholder: "Masalan: Ali Valiyev",
    nextServices: "Keyingi: Xizmatlar",
    servicesTitle: "2-qadam: Xizmat tanlash",
    serviceSearchLabel: "Xizmat qidirish",
    serviceSearchPlaceholder: "Masalan: Burun chayish",
    serviceSearchEmpty: "Mos xizmat topilmadi",
    noServices: "Hali xizmat yo'q. Avval \"Xizmat qo'shish\" bo'limida xizmat yarating.",
    noSearchResults: "Qidiruv bo'yicha xizmat topilmadi.",
    price: "Narx",
    quantity: "Miqdor",
    remove: "Olib tashlash",
    back: "Orqaga",
    nextPreview: "Keyingi: Preview",
    previewTitle: "3-qadam: Chek preview",
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
    uz: "Og'iz bo'shlig'ini ishlov berish"
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
  const [step, setStep] = useState(1);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);

  const [services, setServices] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [serviceInputs, setServiceInputs] = useState({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [patient, setPatient] = useState({ fullName: "" });

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const patientInputRef = useRef(null);
  const serviceSearchRef = useRef(null);
  const previewRef = useRef(null);

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setLanguage(getStoredLanguage(lorDoctor?.id));
  }, [lorDoctor?.id]);

  useEffect(() => {
    const focusElement = (element) => {
      if (!element) return;
      setTimeout(() => {
        try {
          element.focus();
          if (typeof element.select === "function") element.select();
        } catch {
          // no-op
        }
      }, 0);
    };

    if (step === 1) focusElement(patientInputRef.current);
    if (step === 2) focusElement(serviceSearchRef.current);
    if (step === 3) focusElement(previewRef.current);
  }, [step]);

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
      throw new Error(text.errors.patientRequired);
    }
  };

  const toggleService = (serviceId) => {
    setSelectedServiceIds((prev) => {
      const exists = prev.includes(serviceId);
      if (exists) {
        return prev.filter((id) => id !== serviceId);
      }

      setServiceInputs((prevInputs) => ({
        ...prevInputs,
        [serviceId]: {
          quantity: prevInputs[serviceId]?.quantity || "1"
        }
      }));

      return [...prev, serviceId];
    });
  };

  const updateServiceQuantity = (serviceId, value) => {
    setServiceInputs((prev) => ({
      ...prev,
      [serviceId]: {
        quantity: safeQty(value)
      }
    }));
  };

  const changeLorContext = () => {
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

      if (selectedServiceIds.length === 0) {
        throw new Error(text.errors.serviceRequired);
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
      setStep(1);

      const written = writeCheckToPrintTab(printTab, result.check);
      if (!written) {
        setError(text.popupBlocked);
      }
    } catch (err) {
      closePrintTab(printTab);
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const goNextFromPatient = () => {
    resetMessages();
    try {
      validateDoctor();
      validatePatient();
      setStep(2);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const goNextFromServices = () => {
    resetMessages();
    setStep(3);
  };

  if (loading) {
    return <Spinner text={text.loading} />;
  }

  return (
    <div className="space-y-4 overflow-x-hidden sm:space-y-6">
      <div className="card sampi-lor-service-hero border-sky-200 bg-sky-50/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{text.heroTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{text.heroSubtitle}</p>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
            <div
              className="inline-flex w-fit items-center gap-1 rounded-xl border border-cyan-200 bg-white/75 p-1"
              aria-label={text.languageLabel}
            >
              <span className="px-2 text-[10px] font-black uppercase text-cyan-700">
                {text.languageLabel}
              </span>
              {LANGUAGE_OPTIONS.map((option) => {
                const active = option.id === language;

                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.title}
                    aria-pressed={active}
                    onClick={() => handleLanguageChange(option.id)}
                    className={`min-w-10 rounded-lg px-2.5 py-1.5 text-xs font-black transition ${
                      active
                        ? "bg-cyan-700 text-white shadow-sm"
                        : "text-slate-600 hover:bg-cyan-50 hover:text-cyan-800"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="sampi-lor-context-card">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-cyan-700">
                  {text.contextLabel}
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {lorIdentity ? lorIdentity.toUpperCase() : "-"} -{" "}
                  {lorDoctor?.name || text.doctorFallback}
                </p>
              </div>
              <Button variant="secondary" className="px-3 py-2 text-xs" onClick={changeLorContext}>
                {text.switchContext}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {text.steps.map((label, index) => {
            const n = index + 1;
            const active = n === step;
            const done = n < step;

            return (
              <div
                key={label}
                className={`sampi-lor-step-pill ${
                  active ? "sampi-lor-step-active" : done ? "sampi-lor-step-done" : ""
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        <div
          className="card border-sky-200 p-4 sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              goNextFromPatient();
            }
          }}
        >
          <h2 className="text-lg font-semibold">{text.patientTitle}</h2>
          <p className="mb-3 text-sm text-slate-600">{text.patientHint}</p>
          <Input
            label={text.patientLabel}
            value={patient.fullName}
            placeholder={text.patientPlaceholder}
            inputRef={patientInputRef}
            onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
          />

          <div className="mt-4 flex justify-end">
            <Button
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={goNextFromPatient}
            >
              {text.nextServices}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div
          className="card border-sky-200 p-4 sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              goNextFromServices();
            }
          }}
        >
          <h2 className="text-lg font-semibold">{text.servicesTitle}</h2>
          <QuickSearchInput
            label={text.serviceSearchLabel}
            placeholder={text.serviceSearchPlaceholder}
            value={serviceSearch}
            onChange={setServiceSearch}
            inputRef={serviceSearchRef}
            items={sortedServices}
            getItemLabel={(item) => getDisplayServiceName(item, language)}
            onPick={(service) => {
              setServiceSearch(getDisplayServiceName(service, language));
            }}
            emptyText={text.serviceSearchEmpty}
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedServices.length === 0 ? (
              <div className="md:col-span-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 xl:col-span-3">
                {text.noServices}
              </div>
            ) : null}

            {sortedServices.length > 0 && filteredServices.length === 0 ? (
              <div className="md:col-span-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 xl:col-span-3">
                {text.noSearchResults}
              </div>
            ) : null}

            {filteredServices.map((service) => {
              const selected = selectedServiceIds.includes(service._id);
              const displayName = getDisplayServiceName(service, language);

              return (
                <button
                  key={service._id}
                  type="button"
                  onClick={() => toggleService(service._id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-primary bg-cyan-50"
                      : "border-slate-200 bg-white hover:border-primary/50"
                  }`}
                >
                  <p className="font-semibold text-slate-800">{displayName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {text.price}: {service.price ? formatCurrency(service.price) : "-"}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedServiceIds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedServiceIds.map((serviceId) => {
                const service = sortedServices.find((item) => item._id === serviceId);
                const displayName = getDisplayServiceName(service, language);

                return (
                  <div
                    key={serviceId}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_160px_auto]"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{displayName}</p>
                      <p className="text-xs text-slate-500">
                        {text.price}: {service?.price ? formatCurrency(service.price) : "-"}
                      </p>
                    </div>
                    <Input
                      label={text.quantity}
                      type="number"
                      min="1"
                      value={serviceInputs[serviceId]?.quantity || ""}
                      onChange={(e) => updateServiceQuantity(serviceId, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-fit self-end"
                      onClick={() => toggleService(serviceId)}
                    >
                      {text.remove}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(1)}>
              {text.back}
            </Button>
            <Button
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={goNextFromServices}
            >
              {text.nextPreview}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div
          ref={previewRef}
          tabIndex={0}
          className="card border-sky-200 p-4 outline-none sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !submittingCheckout && selectedServiceIds.length > 0) {
              event.preventDefault();
              handleCreateCheckout();
            }
          }}
        >
          <h2 className="text-lg font-semibold">{text.previewTitle}</h2>
          <p className="mb-3 text-sm text-slate-600">{text.previewHint}</p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm">
              {text.doctor}: <span className="font-semibold">{lorDoctor?.name || "-"}</span>
            </p>
            <p className="text-sm">
              {text.patient}: <span className="font-semibold">{patient.fullName || "-"}</span>
            </p>
            <p className="text-sm">
              {text.lorChoice}:{" "}
              <span className="font-semibold">{lorIdentity ? lorIdentity.toUpperCase() : "-"}</span>
            </p>

            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold">{text.services}</p>
              {previewServices.length ? (
                previewServices.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">{text.noneSelected}</p>
              )}
            </div>

            <div className="mt-3 border-t border-dashed border-slate-300 pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>{text.total}</span>
                <span>{formatCurrency(previewTotal)}</span>
              </div>
            </div>
          </div>

          {!selectedServiceIds.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {text.needServiceWarning}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(2)}>
              {text.back}
            </Button>
            <Button
              loading={submittingCheckout}
              disabled={!selectedServiceIds.length}
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={handleCreateCheckout}
              loadingText={text.loadingAction}
            >
              {text.printCheck}
            </Button>
          </div>
        </div>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submittingCheckout} text={text.creatingCheck} />
    </div>
  );
}

export default LorServicesPage;
