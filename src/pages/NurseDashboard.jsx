import { useEffect, useMemo, useRef, useState } from "react";
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
import MobileActionBar from "../components/MobileActionBar.jsx";
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

const STEP_ITEMS = [
  { label: "1. Hamshira", icon: "user" },
  { label: "2. Bemor", icon: "patient" },
  { label: "3. Dorilar", icon: "pill" },
  { label: "4. Xizmatlar", icon: "stethoscope" },
  { label: "5. Chek preview", icon: "receipt" }
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

function StepIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-4 w-4"
  };

  if (name === "user") {
    return (
      <svg {...common}>
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </svg>
    );
  }
  if (name === "patient") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M16 11h6" />
      </svg>
    );
  }
  if (name === "pill") {
    return (
      <svg {...common}>
        <path d="M8 4a4 4 0 0 1 5.7 0l6.3 6.3a4 4 0 0 1-5.7 5.7L8 9.7A4 4 0 0 1 8 4z" />
        <path d="M9 9l6 6" />
      </svg>
    );
  }
  if (name === "stethoscope") {
    return (
      <svg {...common}>
        <path d="M6 4v5a4 4 0 0 0 8 0V4" />
        <path d="M10 13v2a4 4 0 1 0 8 0v-1" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
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
  const hasPatientName = Boolean(patient.fullName.trim());

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

  const loadSpecialists = async () => {
    const data = await usageService.getRoleSpecialists();
    setSpecialists(data);

    setSelectedSpecialistId((prev) => {
      if (prev && data.some((item) => item._id === prev)) return prev;
      return data[0]?._id || "";
    });
  };

  const loadData = async () => {
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
  };

  useEffect(() => {
    loadData();
  }, []);

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
      if (!printed) {
        setError("Chek yaratildi, lekin avtomatik print ochilmadi. \"Mening cheklarim\" bo'limidan qayta chiqaring.");
      }
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
    <div className="nurse-theme-shell space-y-4 sm:space-y-6 sampi-mobile-safe">
      <div className="card nurse-hero-card p-4 sm:p-5">
        <div className="nurse-hero-head gap-4">
          <div>
            <p className="nurse-hero-badge">Nurse Workflow</p>
            <h1 className="nurse-hero-title">Hamshira paneli</h1>
            <p className="nurse-hero-subtitle">Bosqichma-bosqich chek yaratish</p>
          </div>
          <div className="nurse-hero-kpis">
            <div className="nurse-hero-kpi">
              <span>Hamshiralar</span>
              <strong>{specialists.length}</strong>
            </div>
            <div className="nurse-hero-kpi">
              <span>Bemor holati</span>
              <strong>{hasPatientName ? "Tayyor" : "Kutilmoqda"}</strong>
            </div>
            <div className="nurse-hero-kpi">
              <span>Jami preview</span>
              <strong>{formatCurrency(previewTotal)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 nurse-step-grid">
          {STEP_ITEMS.map((item, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <div
                key={item.label}
                className={`nurse-step-pill ${active ? "is-active" : done ? "is-done" : ""}`}
              >
                <span className="nurse-step-text">{item.label}</span>
                <span className="nurse-step-icon-wrap" aria-hidden="true">
                  <StepIcon name={item.icon} />
                  <em>{n}</em>
                </span>
                <span className="sr-only">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        <div
          className="card nurse-work-card p-4 sm:p-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromSpecialist();
            }
          }}
        >
          <p className="nurse-block-tag">1-bosqich</p>
          <h2 className="nurse-block-title">Hamshira tanlash</h2>
          <p className="mb-4 text-sm text-slate-600">
            Avval chekni kim yaratishini tanlang. Yangi hamshira qo'shish uchun chap menyudan
            "Hamshiralarni boshqarish" ga o'ting.
          </p>

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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSpecialists.map((item) => {
                const selected = selectedSpecialistId === item._id;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedSpecialistId(item._id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "sampi-choice-card is-selected"
                        : "sampi-choice-card"
                    }`}
                    style={{ touchAction: "pan-y" }}
                  >
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {selected ? "Tanlangan" : "Tanlash uchun bosing"}
                    </p>
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

          <div className="nurse-inline-info mt-4">
            <span>{selectedSpecialist?.name || "Mutaxassis tanlanmagan"}</span>
            <strong>Qadam: {step}/5</strong>
          </div>

          <div className="mt-4 hidden justify-end sm:flex">
            <Button className="nurse-accent-btn w-full sm:w-auto" onClick={goNextFromSpecialist}>
              Keyingi: Bemor
            </Button>
          </div>
          <MobileActionBar>
            <Button className="nurse-accent-btn w-full" onClick={goNextFromSpecialist}>
              Keyingi: Bemor
            </Button>
          </MobileActionBar>
        </div>
      ) : null}

      {step === 2 ? (
        <div
          className="card nurse-work-card p-4 sm:p-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromPatient();
            }
          }}
        >
          <p className="nurse-block-tag">2-bosqich</p>
          <h2 className="nurse-block-title">Bemor F.I.O</h2>
          <Input
            label="Bemor F.I.O"
            value={patient.fullName}
            placeholder="Masalan: Ali Valiyev"
            inputRef={patientInputRef}
            onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
          />
          <div className="mt-4 hidden flex-col-reverse gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(1)}>
              Orqaga
            </Button>
            <Button className="nurse-accent-btn w-full sm:w-auto" onClick={goNextFromPatient}>
              Keyingi: Dorilar
            </Button>
          </div>
          <MobileActionBar>
            <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
              Orqaga
            </Button>
            <Button
              className="nurse-accent-btn flex-1"
              onClick={goNextFromPatient}
            >
              Keyingi
            </Button>
          </MobileActionBar>
        </div>
      ) : null}

      {step === 3 ? (
        <div
          className="card nurse-work-card p-4 sm:p-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromMedicines();
            }
          }}
        >
          <p className="nurse-block-tag">3-bosqich</p>
          <h2 className="nurse-block-title">Dorilar</h2>
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
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredMedicines.map((medicine) => {
              const selected = selectedMedicineIds.includes(medicine._id);
              const blocked = medicine.stock <= 0 || !isValidPrice(medicine.price);
              return (
                <button
                  key={medicine._id}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleMedicine(medicine._id, !blocked)}
                  className={`px-3 py-3 text-left ${
                    selected
                      ? "sampi-choice-card is-selected"
                      : blocked
                        ? "sampi-choice-card is-disabled"
                        : "sampi-choice-card"
                  }`}
                  style={{ touchAction: "pan-y" }}
                >
                  <p className="font-semibold">{medicine.name}</p>
                  <p className="text-xs text-slate-600">Qoldiq: {medicine.stock}</p>
                  <p className="text-xs text-slate-500">
                    Narx: {isValidPrice(medicine.price) ? formatCurrency(medicine.price) : "-"}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedMedicineIds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedMedicineIds.map((id) => {
                const medicine = medicines.find((m) => m._id === id);
                return (
                  <div
                    key={id}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_180px_auto]"
                  >
                    <div>
                      <p className="font-medium">{medicine?.name}</p>
                      <p className="text-xs text-slate-500">Qoldiq: {medicine?.stock}</p>
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

          <div className="mt-4 hidden flex-col-reverse gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between">
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
                Skip
              </Button>
              <Button
                className="nurse-accent-btn w-full sm:w-auto"
                onClick={goNextFromMedicines}
              >
                Keyingi
              </Button>
            </div>
          </div>
          <MobileActionBar>
            <div className="grid w-full grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Orqaga
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedMedicineIds([]);
                  setMedicineInputs({});
                  setStep(4);
                }}
              >
                Skip
              </Button>
              <Button
                className="nurse-accent-btn"
                onClick={goNextFromMedicines}
              >
                Keyingi
              </Button>
            </div>
          </MobileActionBar>
        </div>
      ) : null}

      {step === 4 ? (
        <div
          className="card nurse-work-card p-4 sm:p-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goNextFromServices();
            }
          }}
        >
          <p className="nurse-block-tag">4-bosqich</p>
          <h2 className="nurse-block-title">Xizmatlar</h2>
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
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredServices.map((service) => {
              const selected = selectedServiceIds.includes(service._id);
              const blocked = !getTierPrices(service);
              return (
                <button
                  key={service._id}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleService(service._id, !blocked)}
                  className={`px-3 py-3 text-left ${
                    selected
                      ? "sampi-choice-card is-selected"
                      : blocked
                        ? "sampi-choice-card is-disabled"
                        : "sampi-choice-card"
                  }`}
                  style={{ touchAction: "pan-y" }}
                >
                  <p className="font-semibold">{service.name}</p>
                  <p className="text-xs text-slate-500">
                    1/2/3: {getServicePrice(service, "first") ? formatCurrency(getServicePrice(service, "first")) : "-"} / {getServicePrice(service, "second") ? formatCurrency(getServicePrice(service, "second")) : "-"} / {getServicePrice(service, "third") ? formatCurrency(getServicePrice(service, "third")) : "-"}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedServiceIds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedServiceIds.map((id) => {
                const service = services.find((s) => s._id === id);
                const tier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
                  ? serviceInputs[id]?.priceTier
                  : "first";
                return (
                  <div
                    key={id}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_160px_180px_auto]"
                  >
                    <div>
                      <p className="font-medium">{service?.name}</p>
                      <p className="text-xs text-slate-500">
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

          <div className="mt-4 hidden flex-col-reverse gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between">
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
                Skip
              </Button>
              <Button
                className="nurse-accent-btn w-full sm:w-auto"
                onClick={goNextFromServices}
              >
                Keyingi
              </Button>
            </div>
          </div>
          <MobileActionBar>
            <div className="grid w-full grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => setStep(3)}>
                Orqaga
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedServiceIds([]);
                  setServiceInputs({});
                  setStep(5);
                }}
              >
                Skip
              </Button>
              <Button
                className="nurse-accent-btn"
                onClick={goNextFromServices}
              >
                Keyingi
              </Button>
            </div>
          </MobileActionBar>
        </div>
      ) : null}

      {step === 5 ? (
        <div
          ref={previewRef}
          tabIndex={0}
          className="card nurse-work-card p-4 outline-none sm:p-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasAnySelection && !submitting) {
              e.preventDefault();
              handleCheckout();
            }
          }}
        >
          <p className="nurse-block-tag">5-bosqich</p>
          <h2 className="nurse-block-title">Chek preview</h2>
          <p className="mb-3 text-sm text-slate-600">Enter bosib chek chiqaring.</p>

          <div className="nurse-preview-surface">
            <p className="text-sm">
              Hamshira: <span className="font-semibold">{selectedSpecialist?.name || "-"}</span>
            </p>
            <p className="text-sm">
              Bemor: <span className="font-semibold">{patient.fullName || "-"}</span>
            </p>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold">Dorilar</p>
              {previewMedicines.length ? (
                previewMedicines.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Tanlanmagan</p>
              )}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold">Xizmatlar</p>
              {previewServices.length ? (
                previewServices.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.name} ({PRICE_TIER_LABELS[item.tier]}) x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Tanlanmagan</p>
              )}
            </div>
            <div className="mt-3 border-t border-dashed border-slate-300 pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Jami</span>
                <span>{formatCurrency(previewTotal)}</span>
              </div>
            </div>
          </div>

          {!hasAnySelection ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Chek chiqarish uchun kamida bitta dori yoki bitta xizmat tanlanishi kerak.
            </div>
          ) : null}

          <div className="mt-4 hidden flex-col-reverse gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(4)}>
              Orqaga
            </Button>
            <Button
              disabled={!hasAnySelection}
              loading={submitting}
              className="nurse-accent-btn w-full sm:w-auto"
              onClick={handleCheckout}
            >
              Chek chiqarish (Enter)
            </Button>
          </div>
          <MobileActionBar>
            <Button variant="secondary" className="flex-1" onClick={() => setStep(4)}>
              Orqaga
            </Button>
            <Button
              disabled={!hasAnySelection}
              loading={submitting}
              className="nurse-accent-btn flex-1"
              onClick={handleCheckout}
            >
              Chek chiqarish
            </Button>
          </MobileActionBar>
        </div>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submitting} text="Chek yaratilmoqda..." />
    </div>
  );
}

export default NurseDashboard;
