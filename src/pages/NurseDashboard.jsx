import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import medicineService from "../services/medicineService.js";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
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

const STEP_LABELS = [
  "1. Hamshira",
  "2. Bemor",
  "3. Dorilar",
  "4. Xizmatlar",
  "5. Chek preview"
];
const PRICE_TIER_LABELS = { first: "1-marta", second: "2-marta", third: "3-marta" };
const PRICE_TIER_ORDER = ["first", "second", "third"];
const PRICE_TIER_OPTIONS = PRICE_TIER_ORDER.map((value) => ({
  value,
  label: PRICE_TIER_LABELS[value]
}));

const isValidPrice = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1000000;
};

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

const safeQty = (value, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.max(1, Math.min(Math.floor(n), Math.floor(max))));
};

const getTierPrices = (service) => {
  const first = Number(service?.priceOptions?.first);
  const second = Number(service?.priceOptions?.second);
  const third = Number(service?.priceOptions?.third);
  if (isValidPrice(first) && isValidPrice(second) && isValidPrice(third)) {
    return { first, second, third };
  }
  const base = Number(service?.price);
  if (isValidPrice(base)) return { first: base, second: base, third: base };
  return null;
};

const getServicePrice = (service, tier) => {
  const tiers = getTierPrices(service);
  if (!tiers) return null;
  return tiers[PRICE_TIER_ORDER.includes(tier) ? tier : "first"];
};

const getInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "H";
  return parts.map((part) => part[0]?.toLocaleUpperCase("uz-UZ")).join("");
};

function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NursePanelHeader({ eyebrow, title, children, meta }) {
  return (
    <div className="nurse-panel-header">
      <div className="min-w-0">
        <p className="nurse-eyebrow">{eyebrow}</p>
        <h2 className="mt-1 break-words text-lg font-black text-slate-900 sm:text-xl">{title}</h2>
        {children ? <p className="mt-1 max-w-2xl break-words text-sm font-medium text-slate-500">{children}</p> : null}
      </div>
      {meta ? <div className="nurse-panel-meta">{meta}</div> : null}
    </div>
  );
}

function NurseStepCard({ label, index, active, done }) {
  return (
    <div
      className={`nurse-step-card ${active ? "nurse-step-active" : ""} ${done ? "nurse-step-done" : ""}`}
    >
      <span className="nurse-step-number">{index + 1}</span>
      <span className="min-w-0 truncate">{label.replace(/^\d+\.\s*/, "")}</span>
    </div>
  );
}

function NurseDashboard() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("");
  const [specialistSearch, setSpecialistSearch] = useState("");

  const [medicines, setMedicines] = useState([]);
  const [services, setServices] = useState([]);
  const [patient, setPatient] = useState({ fullName: "" });
  const [selectedMedicineIds, setSelectedMedicineIds] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [medicineInputs, setMedicineInputs] = useState({});
  const [serviceInputs, setServiceInputs] = useState({});
  const [medicineSearch, setMedicineSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const specialistSearchRef = useRef(null);
  const patientInputRef = useRef(null);
  const medicineSearchRef = useRef(null);
  const serviceSearchRef = useRef(null);
  const previewRef = useRef(null);

  const hasAnySelection = selectedMedicineIds.length > 0 || selectedServiceIds.length > 0;

  const selectedSpecialist = useMemo(
    () => specialists.find((item) => item._id === selectedSpecialistId) || null,
    [specialists, selectedSpecialistId]
  );

  const filteredSpecialists = useMemo(() => {
    const q = normalizeSearch(specialistSearch);
    if (!q) return specialists;
    return specialists.filter((item) => normalizeSearch(item?.name).includes(q));
  }, [specialists, specialistSearch]);

  const filteredMedicines = useMemo(() => {
    const q = normalizeSearch(medicineSearch);
    if (!q) return medicines;
    return medicines.filter((m) => normalizeSearch(m?.name).includes(q));
  }, [medicines, medicineSearch]);

  const filteredServices = useMemo(() => {
    const q = normalizeSearch(serviceSearch);
    if (!q) return services;
    return services.filter((s) => normalizeSearch(s?.name).includes(q));
  }, [services, serviceSearch]);

  const previewMedicines = useMemo(
    () =>
      selectedMedicineIds
        .map((id) => {
          const medicine = medicines.find((m) => m._id === id);
          if (!medicine) return null;
          const quantity = Number(medicineInputs[id]?.quantity || 1);
          const lineTotal = quantity * Number(medicine.price || 0);
          return { id, name: medicine.name, quantity, lineTotal };
        })
        .filter(Boolean),
    [selectedMedicineIds, medicines, medicineInputs]
  );

  const previewServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => {
          const service = services.find((s) => s._id === id);
          if (!service) return null;
          const quantity = Number(serviceInputs[id]?.quantity || 1);
          const tier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
            ? serviceInputs[id]?.priceTier
            : "first";
          const unitPrice = Number(getServicePrice(service, tier) || 0);
          const lineTotal = quantity * unitPrice;
          return { id, name: service.name, quantity, tier, lineTotal };
        })
        .filter(Boolean),
    [selectedServiceIds, services, serviceInputs]
  );

  const previewTotal = useMemo(() => {
    const m = previewMedicines.reduce((sum, item) => sum + item.lineTotal, 0);
    const s = previewServices.reduce((sum, item) => sum + item.lineTotal, 0);
    return m + s;
  }, [previewMedicines, previewServices]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const loadSpecialists = useCallback(async () => {
    const data = await usageService.getRoleSpecialists();
    setSpecialists(data);

    setSelectedSpecialistId((prev) => {
      if (prev && data.some((item) => item._id === prev)) return prev;
      return data[0]?._id || "";
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [medicineData, serviceData] = await Promise.all([
        medicineService.getAllMedicines(),
        serviceService.getAllServices(),
        loadSpecialists()
      ]);
      setMedicines(medicineData);
      setServices(serviceData.filter((item) => item.type === "nurse"));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadSpecialists]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

    if (step === 1) focusElement(specialistSearchRef.current);
    if (step === 2) focusElement(patientInputRef.current);
    if (step === 3) focusElement(medicineSearchRef.current);
    if (step === 4) focusElement(serviceSearchRef.current);
    if (step === 5) focusElement(previewRef.current);
  }, [step]);

  useEffect(() => {
    setSelectedMedicineIds((prev) =>
      prev.filter((id) => medicines.some((m) => m._id === id && m.stock > 0 && isValidPrice(m.price)))
    );
  }, [medicines]);

  useEffect(() => {
    setSelectedServiceIds((prev) =>
      prev.filter((id) => services.some((s) => s._id === id && !!getTierPrices(s)))
    );
  }, [services]);

  const validateSpecialist = () => {
    if (!selectedSpecialistId) {
      throw new Error("Avval hamshirani tanlang.");
    }
  };

  const validatePatient = () => {
    const { firstName, lastName } = splitFullName(patient.fullName);
    if (!firstName.trim() || !lastName.trim()) {
      throw new Error("Bemor F.I.O ni to'liq kiriting (ismi va familiyasi).");
    }
  };

  const toggleMedicine = (medicineId, canUse) => {
    if (!canUse) return;
    setSelectedMedicineIds((prev) => {
      if (prev.includes(medicineId)) return prev.filter((id) => id !== medicineId);
      setMedicineInputs((v) => ({ ...v, [medicineId]: { quantity: v[medicineId]?.quantity || "1" } }));
      return [...prev, medicineId];
    });
  };

  const toggleService = (serviceId, canUse) => {
    if (!canUse) return;
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) return prev.filter((id) => id !== serviceId);
      setServiceInputs((v) => ({
        ...v,
        [serviceId]: { quantity: v[serviceId]?.quantity || "1", priceTier: v[serviceId]?.priceTier || "first" }
      }));
      return [...prev, serviceId];
    });
  };

  const goNextFromSpecialist = () => {
    resetMessages();
    try {
      validateSpecialist();
      setStep(2);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const goNextFromPatient = () => {
    resetMessages();
    try {
      validatePatient();
      setStep(3);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const goNextFromMedicines = () => {
    resetMessages();
    setStep(4);
  };

  const goNextFromServices = () => {
    resetMessages();
    setStep(5);
  };

  const handleCheckout = async () => {
    if (submitting) return;
    resetMessages();
    setSubmitting(true);
    let printSession = null;

    try {
      validateSpecialist();
      validatePatient();
      if (!hasAnySelection) throw new Error("Kamida bitta dori yoki xizmat tanlang.");

      const parsedPatient = splitFullName(patient.fullName);
      const medicinesPayload = selectedMedicineIds.map((id) => {
        const medicine = medicines.find((m) => m._id === id);
        if (!medicine) throw new Error("Tanlangan dori topilmadi.");
        const quantity = Number(medicineInputs[id]?.quantity || 1);
        if (quantity <= 0) throw new Error("Miqdor noto'g'ri.");
        if (medicine.stock < quantity) throw new Error(`${medicine.name} uchun qoldiq yetarli emas.`);
        return { medicineId: id, quantity };
      });

      const servicesPayload = selectedServiceIds.map((id) => {
        const service = services.find((s) => s._id === id);
        if (!service) throw new Error("Tanlangan xizmat topilmadi.");
        const quantity = Number(serviceInputs[id]?.quantity || 1);
        const priceTier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
          ? serviceInputs[id]?.priceTier
          : "first";
        if (!isValidPrice(getServicePrice(service, priceTier))) {
          throw new Error(`${service.name} uchun narx sozlanmagan.`);
        }
        return { serviceId: id, quantity, priceTier };
      });

      printSession = openPendingPrintTab();
      const result = await usageService.createCheckout({
        patient: {
          firstName: parsedPatient.firstName.trim(),
          lastName: parsedPatient.lastName.trim()
        },
        specialistId: selectedSpecialistId,
        specialistName: selectedSpecialist?.name || "",
        medicines: medicinesPayload,
        services: servicesPayload
      });

      const printed = writeCheckToPrintTab(printSession, result.check);
      if (!printed) setError("Brauzer yangi oynani blokladi. Ruxsat bering.");
      setSuccess("Chek muvaffaqiyatli yaratildi.");
      setPatient({ fullName: "" });
      setSelectedMedicineIds([]);
      setSelectedServiceIds([]);
      setMedicineInputs({});
      setServiceInputs({});
      setMedicineSearch("");
      setServiceSearch("");
      setStep(1);
      void loadData();
    } catch (err) {
      closePrintTab(printSession);
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner text="Hamshira paneli yuklanmoqda..." />;

  return (
    <div className="nurse-dashboard space-y-4 sm:space-y-5">
      <section className="nurse-hero">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="nurse-kicker">Hamshira paneli</p>
            <h1 className="mt-2 break-words text-2xl font-black text-slate-950 sm:text-3xl">
              Chek yaratish
            </h1>
            <p className="mt-2 max-w-3xl break-words text-sm font-medium text-slate-600 sm:text-base">
              Hamshira, bemor, dori va xizmatlar bitta tartibli flow ichida yig'iladi.
            </p>
          </div>

          <div className="nurse-hero-stats">
            <div className="nurse-hero-stat">
              <span>Hamshira</span>
              <strong>{selectedSpecialist?.name || "-"}</strong>
            </div>
            <div className="nurse-hero-stat">
              <span>Tanlangan</span>
              <strong>{selectedMedicineIds.length + selectedServiceIds.length}</strong>
            </div>
            <div className="nurse-hero-stat nurse-hero-stat-total">
              <span>Jami</span>
              <strong>{formatCurrency(previewTotal)}</strong>
            </div>
          </div>
        </div>

        <div className="nurse-progress-grid">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            return (
              <NurseStepCard
                key={label}
                label={label}
                index={i}
                active={n === step}
                done={n < step}
              />
            );
          })}
        </div>
      </section>

      {step === 1 ? (
        <div
          className="nurse-panel"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromSpecialist();
            }
          }}
        >
          <NursePanelHeader
            eyebrow="1-qadam"
            title="Hamshira tanlash"
            meta={`${filteredSpecialists.length} ta natija`}
          >
            Chek kim nomidan yaratilishini belgilang.
          </NursePanelHeader>

          <div className="mt-4">
            <QuickSearchInput
              label="Hamshira qidirish"
              placeholder="Masalan: Malika"
              value={specialistSearch}
              onChange={setSpecialistSearch}
              inputRef={specialistSearchRef}
              items={specialists}
              getItemLabel={(item) => item?.name || ""}
              onPick={(item) => {
                setSelectedSpecialistId(item?._id || "");
                setSpecialistSearch(item?.name || "");
              }}
              emptyText="Mos hamshira topilmadi"
            />
          </div>

          {specialists.length ? (
            <div className="nurse-card-grid mt-4">
              {filteredSpecialists.map((item) => {
                const selected = selectedSpecialistId === item._id;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedSpecialistId(item._id)}
                    aria-pressed={selected}
                    className={`nurse-choice-card ${selected ? "nurse-choice-card-selected" : ""}`}
                  >
                    <span className="nurse-avatar">{getInitials(item.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-black text-slate-900">
                        {item.name}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">
                        {selected ? "Tanlangan" : "Hamshira"}
                      </span>
                    </span>
                    <span className="nurse-select-dot">{selected ? <CheckIcon /> : null}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!specialists.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Hozircha hamshira yo'q. Chap menyudan "Hamshiralarni boshqarish" bo'limida
              yangi hamshira qo'shing.
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={goNextFromSpecialist}
            >
              Keyingi: Bemor
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div
          className="nurse-panel"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromPatient();
            }
          }}
        >
          <NursePanelHeader eyebrow="2-qadam" title="Bemor ma'lumoti">
            Ism va familiyani bitta maydonda to'liq kiriting.
          </NursePanelHeader>
          <div className="mt-4 max-w-2xl">
          <Input
            label="Bemor F.I.O"
            value={patient.fullName}
            placeholder="Masalan: Ali Valiyev"
            inputRef={patientInputRef}
            onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
          />
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(1)}>
              Orqaga
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={goNextFromPatient}
            >
              Keyingi: Dorilar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div
          className="nurse-panel"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromMedicines();
            }
          }}
        >
          <NursePanelHeader
            eyebrow="3-qadam"
            title="Dorilar"
            meta={`${selectedMedicineIds.length} ta tanlandi`}
          >
            Omborda bor va narxi sozlangan dorilarni tanlang.
          </NursePanelHeader>
          <div className="mt-4">
          <QuickSearchInput
            label="Dori qidirish"
            placeholder="Masalan: Paracetamol"
            value={medicineSearch}
            onChange={setMedicineSearch}
            inputRef={medicineSearchRef}
            items={medicines}
            getItemLabel={(item) => item?.name || ""}
            onPick={(item) => setMedicineSearch(item?.name || "")}
            emptyText="Mos dori topilmadi"
          />
          </div>
          <div className="nurse-card-grid mt-4">
            {filteredMedicines.map((medicine) => {
              const selected = selectedMedicineIds.includes(medicine._id);
              const blocked = medicine.stock <= 0 || !isValidPrice(medicine.price);
              return (
                <button
                  key={medicine._id}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleMedicine(medicine._id, !blocked)}
                  aria-pressed={selected}
                  className={`nurse-product-card ${selected ? "nurse-product-selected" : ""} ${blocked ? "nurse-product-blocked" : ""}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words text-sm font-black text-slate-900">{medicine.name}</span>
                    <span className="mt-3 flex flex-wrap gap-2">
                      <span className="nurse-mini-metric">Qoldiq: {medicine.stock}</span>
                      <span className="nurse-mini-metric">
                        {isValidPrice(medicine.price) ? formatCurrency(medicine.price) : "Narx yo'q"}
                      </span>
                    </span>
                  </span>
                  <span className="nurse-select-dot">{selected ? <CheckIcon /> : null}</span>
                </button>
              );
            })}
          </div>

          {selectedMedicineIds.length > 0 ? (
            <div className="nurse-selection-list mt-4">
              {selectedMedicineIds.map((id) => {
                const medicine = medicines.find((m) => m._id === id);
                return (
                  <div
                    key={id}
                    className="nurse-selection-row md:grid-cols-[minmax(0,1fr)_180px_auto]"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-900">{medicine?.name}</p>
                      <p className="text-xs font-semibold text-slate-500">Qoldiq: {medicine?.stock}</p>
                    </div>
                    <Input
                      label="Miqdor"
                      type="number"
                      min="1"
                      max={Math.max(Number(medicine?.stock || 1), 1)}
                      value={medicineInputs[id]?.quantity || ""}
                      onChange={(e) =>
                        setMedicineInputs((prev) => ({
                          ...prev,
                          [id]: { quantity: safeQty(e.target.value, medicine?.stock || 1) }
                        }))
                      }
                    />
                    <Button variant="secondary" className="h-fit self-end" onClick={() => toggleMedicine(id, true)}>
                      Olib tashlash
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(2)}>
              Orqaga
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setSelectedMedicineIds([]);
                  setMedicineInputs({});
                  setStep(4);
                }}
              >
                O'tkazib yuborish
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={goNextFromMedicines}
              >
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div
          className="nurse-panel"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromServices();
            }
          }}
        >
          <NursePanelHeader
            eyebrow="4-qadam"
            title="Xizmatlar"
            meta={`${selectedServiceIds.length} ta tanlandi`}
          >
            Hamshira xizmatini tanlab, kerakli narx turini belgilang.
          </NursePanelHeader>
          <div className="mt-4">
          <QuickSearchInput
            label="Xizmat qidirish"
            placeholder="Masalan: Ukol qilish"
            value={serviceSearch}
            onChange={setServiceSearch}
            inputRef={serviceSearchRef}
            items={services}
            getItemLabel={(item) => item?.name || ""}
            onPick={(item) => setServiceSearch(item?.name || "")}
            emptyText="Mos xizmat topilmadi"
          />
          </div>
          <div className="nurse-card-grid mt-4">
            {filteredServices.map((service) => {
              const selected = selectedServiceIds.includes(service._id);
              const blocked = !getTierPrices(service);
              return (
                <button
                  key={service._id}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleService(service._id, !blocked)}
                  aria-pressed={selected}
                  className={`nurse-product-card ${selected ? "nurse-product-selected" : ""} ${blocked ? "nurse-product-blocked" : ""}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words text-sm font-black text-slate-900">{service.name}</span>
                    <span className="mt-3 flex flex-wrap gap-2">
                      <span className="nurse-mini-metric">
                        1: {getServicePrice(service, "first") ? formatCurrency(getServicePrice(service, "first")) : "-"}
                      </span>
                      <span className="nurse-mini-metric">
                        2: {getServicePrice(service, "second") ? formatCurrency(getServicePrice(service, "second")) : "-"}
                      </span>
                      <span className="nurse-mini-metric">
                        3: {getServicePrice(service, "third") ? formatCurrency(getServicePrice(service, "third")) : "-"}
                      </span>
                    </span>
                  </span>
                  <span className="nurse-select-dot">{selected ? <CheckIcon /> : null}</span>
                </button>
              );
            })}
          </div>

          {selectedServiceIds.length > 0 ? (
            <div className="nurse-selection-list mt-4">
              {selectedServiceIds.map((id) => {
                const service = services.find((s) => s._id === id);
                const tier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
                  ? serviceInputs[id]?.priceTier
                  : "first";
                return (
                  <div
                    key={id}
                    className="nurse-selection-row md:grid-cols-[minmax(0,1fr)_160px_180px_auto]"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-900">{service?.name}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        Narx: {formatCurrency(getServicePrice(service, tier) || 0)}
                      </p>
                    </div>
                    <Input
                      label="Miqdor"
                      type="number"
                      min="1"
                      value={serviceInputs[id]?.quantity || ""}
                      onChange={(e) =>
                        setServiceInputs((prev) => ({
                          ...prev,
                          [id]: {
                            quantity: safeQty(e.target.value),
                            priceTier: prev[id]?.priceTier || "first"
                          }
                        }))
                      }
                    />
                    <SelectMenu
                      label="Narx turi"
                      value={tier}
                      options={PRICE_TIER_OPTIONS}
                      onChange={(nextTier) =>
                        setServiceInputs((prev) => ({
                          ...prev,
                          [id]: {
                            quantity: prev[id]?.quantity || "1",
                            priceTier: nextTier
                          }
                        }))
                      }
                    />
                    <Button variant="secondary" className="h-fit self-end" onClick={() => toggleService(id, true)}>
                      Olib tashlash
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(3)}>
              Orqaga
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setSelectedServiceIds([]);
                  setServiceInputs({});
                  setStep(5);
                }}
              >
                O'tkazib yuborish
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={goNextFromServices}
              >
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div
          ref={previewRef}
          tabIndex={0}
          className="nurse-panel outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasAnySelection && !submitting) {
              e.preventDefault();
              handleCheckout();
            }
          }}
        >
          <NursePanelHeader eyebrow="5-qadam" title="Chek preview" meta={formatCurrency(previewTotal)}>
            Yakuniy chekni ko'rib chiqing.
          </NursePanelHeader>

          <div className="nurse-receipt mt-4">
            <div className="nurse-receipt-head">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Hamshira</p>
                <p className="mt-1 break-words text-base font-black text-slate-900">
                  {selectedSpecialist?.name || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Bemor</p>
                <p className="mt-1 break-words text-base font-black text-slate-900">
                  {patient.fullName || "-"}
                </p>
              </div>
            </div>

            <div className="nurse-receipt-section">
              <div className="nurse-receipt-title">
                <span>Dorilar</span>
                <strong>{previewMedicines.length}</strong>
              </div>
              {previewMedicines.length ? (
                previewMedicines.map((item) => (
                  <div key={item.id} className="nurse-receipt-line">
                    <span className="min-w-0 break-words">
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Tanlanmagan</p>
              )}
            </div>

            <div className="nurse-receipt-section">
              <div className="nurse-receipt-title">
                <span>Xizmatlar</span>
                <strong>{previewServices.length}</strong>
              </div>
              {previewServices.length ? (
                previewServices.map((item) => (
                  <div key={item.id} className="nurse-receipt-line">
                    <span className="min-w-0 break-words">
                      {item.name} ({PRICE_TIER_LABELS[item.tier]}) x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Tanlanmagan</p>
              )}
            </div>

            <div className="nurse-receipt-total">
              <span>Jami</span>
              <strong>{formatCurrency(previewTotal)}</strong>
            </div>
          </div>

          {!hasAnySelection ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Chek chiqarish uchun kamida bitta dori yoki bitta xizmat tanlanishi kerak.
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(4)}>
              Orqaga
            </Button>
            <Button
              disabled={!hasAnySelection}
              loading={submitting}
              className="w-full sm:w-auto"
              onClick={handleCheckout}
            >
              Chek chiqarish
            </Button>
          </div>
        </div>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submitting} text="Chek yaratilmoqda..." />
    </div>
  );
}

export default NurseDashboard;
