import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import medicineService from "../services/medicineService.js";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import PrintingOverlay from "../components/PrintingOverlay.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import { fieldError, showFieldErrorFrom } from "../utils/fieldError.js";
import SelectMenu from "../components/SelectMenu.jsx";
import QuantityStepper from "../components/QuantityStepper.jsx";
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
import { useAuth } from "../context/AuthContext.jsx";

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

function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NurseDashboard() {
  const { nurseSpecialist, setNurseSpecialist } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState(nurseSpecialist?.id || "");

  const [medicines, setMedicines] = useState([]);
  const [services, setServices] = useState([]);
  const [patient, setPatient] = useState({ fullName: "" });
  const [selectedMedicineIds, setSelectedMedicineIds] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [medicineInputs, setMedicineInputs] = useState({});
  const [serviceInputs, setServiceInputs] = useState({});
  const [catalogTab, setCatalogTab] = useState("medicines");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const patientInputRef = useRef(null);
  const catalogSearchRef = useRef(null);

  const hasAnySelection = selectedMedicineIds.length > 0 || selectedServiceIds.length > 0;

  const selectedSpecialist = useMemo(
    () => specialists.find((item) => item._id === selectedSpecialistId) || null,
    [specialists, selectedSpecialistId]
  );

  const filteredMedicines = useMemo(() => {
    const q = normalizeSearch(catalogSearch);
    if (!q) return medicines;
    return medicines.filter((m) => normalizeSearch(m?.name).includes(q));
  }, [medicines, catalogSearch]);

  const filteredServices = useMemo(() => {
    const q = normalizeSearch(catalogSearch);
    if (!q) return services;
    return services.filter((s) => normalizeSearch(s?.name).includes(q));
  }, [services, catalogSearch]);

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
      if (nurseSpecialist?.id && data.some((item) => item._id === nurseSpecialist.id)) {
        return nurseSpecialist.id;
      }
      return data[0]?._id || "";
    });
  }, [nurseSpecialist?.id]);

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
    if (!selectedSpecialist?._id || !selectedSpecialist?.name) return;
    if (nurseSpecialist?.id === selectedSpecialist._id) return;
    setNurseSpecialist({
      id: selectedSpecialist._id,
      name: selectedSpecialist.name
    });
  }, [nurseSpecialist?.id, selectedSpecialist, setNurseSpecialist]);

  useEffect(() => {
    if (!loading) patientInputRef.current?.focus();
  }, [loading]);

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
      throw fieldError("nurse-specialist", "Avval hamshirani tanlang.");
    }
  };

  const validatePatient = () => {
    const { firstName, lastName } = splitFullName(patient.fullName);
    if (!firstName.trim() || !lastName.trim()) {
      throw fieldError("nurse-patient", "Bemor F.I.O ni to'liq kiriting (ismi va familiyasi).");
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

  const clearSelection = () => {
    setSelectedMedicineIds([]);
    setSelectedServiceIds([]);
    setMedicineInputs({});
    setServiceInputs({});
  };

  const handleCheckout = async () => {
    if (submitting) return;
    resetMessages();
    setSubmitting(true);
    let printSession = null;

    try {
      validateSpecialist();
      validatePatient();
      if (!hasAnySelection) throw fieldError("nurse-catalog", "Kamida bitta dori yoki xizmat tanlang.");

      const parsedPatient = splitFullName(patient.fullName);
      const medicinesPayload = selectedMedicineIds.map((id) => {
        const medicine = medicines.find((m) => m._id === id);
        if (!medicine) throw new Error("Tanlangan dori topilmadi.");
        const quantity = Number(medicineInputs[id]?.quantity || 1);
        if (quantity <= 0) throw fieldError(`nurse-line-${id}`, "Miqdor noto'g'ri.");
        if (medicine.stock < quantity) {
          throw fieldError(`nurse-line-${id}`, `Qoldiq yetarli emas: omborda ${medicine.stock} ta bor.`);
        }
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
          throw fieldError(`nurse-line-${id}`, `${service.name} uchun narx sozlanmagan.`);
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

      const printed = await writeCheckToPrintTab(printSession, result.check);
      if (!printed) setError("Brauzer yangi oynani blokladi. Ruxsat bering.");
      setSuccess("Chek muvaffaqiyatli yaratildi.");
      setPatient({ fullName: "" });
      setSelectedMedicineIds([]);
      setSelectedServiceIds([]);
      setMedicineInputs({});
      setServiceInputs({});
      setCatalogSearch("");
      setCatalogTab("medicines");
      patientInputRef.current?.focus();
      void loadData();
    } catch (err) {
      closePrintTab(printSession);
      if (!showFieldErrorFrom(err)) {
        setError(extractErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner page text="Hamshira paneli yuklanmoqda..." />;

  const catalogItems = catalogTab === "medicines" ? filteredMedicines : filteredServices;
  const selectedCount = selectedMedicineIds.length + selectedServiceIds.length;

  return (
    // Pastki panel sahifa oxirida ham ekran tagiga yopishishi uchun main ning pastki paddingi yopiladi.
    <div className="nurse-dashboard -mb-4 flex min-h-[calc(100dvh-5rem)] flex-col gap-4 sm:min-h-[calc(100dvh-5.3rem)] lg:-mb-6 lg:min-h-[calc(100dvh-5.8rem)]">
      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className="card grid gap-3 p-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <SelectMenu
          field="nurse-specialist"
          label="Hamshira"
          value={selectedSpecialistId}
          options={specialists.map((item) => ({ value: item._id, label: item.name }))}
          onChange={(value) => setSelectedSpecialistId(value)}
          placeholder="Hamshirani tanlang"
        />
        <Input
          field="nurse-patient"
          label="Bemor F.I.O"
          value={patient.fullName}
          placeholder="Masalan: Ali Valiyev"
          inputRef={patientInputRef}
          onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              catalogSearchRef.current?.focus();
            }
          }}
        />
        {!specialists.length ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 md:col-span-2">
            Hozircha hamshira yo'q. Menyudagi "Sozlamalar → Hamshiralar" bo'limida qo'shing.
          </p>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex shrink-0 rounded-lg bg-slate-100 p-1" role="tablist">
              {[
                { key: "medicines", label: "Dorilar", count: selectedMedicineIds.length },
                { key: "services", label: "Xizmatlar", count: selectedServiceIds.length }
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={catalogTab === tab.key}
                  onClick={() => setCatalogTab(tab.key)}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                    catalogTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                  {tab.count ? (
                    <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[11px] text-white">
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div data-field="nurse-catalog" className="min-w-0 flex-1">
              <input
                ref={catalogSearchRef}
                type="search"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder={catalogTab === "medicines" ? "Dori qidirish..." : "Xizmat qidirish..."}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            {catalogItems.map((item) => {
              const isMedicine = catalogTab === "medicines";
              const selected = isMedicine
                ? selectedMedicineIds.includes(item._id)
                : selectedServiceIds.includes(item._id);
              const blocked = isMedicine
                ? item.stock <= 0 || !isValidPrice(item.price)
                : !getTierPrices(item);
              const lowStock = isMedicine && item.stock > 0 && item.stock <= 10;
              return (
                <button
                  key={item._id}
                  type="button"
                  disabled={blocked}
                  aria-pressed={selected}
                  onClick={() =>
                    isMedicine ? toggleMedicine(item._id, !blocked) : toggleService(item._id, !blocked)
                  }
                  className={`flex w-full items-center gap-3 border-t border-slate-200 px-3 py-2.5 text-left transition first:border-t-0 ${
                    selected ? "bg-cyan-50" : "bg-white hover:bg-slate-50"
                  } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                      selected ? "border-primary bg-primary text-white" : "border-slate-300"
                    }`}
                  >
                    {selected ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-slate-900">{item.name}</span>
                    {isMedicine ? (
                      <span
                        className={`text-xs font-semibold ${
                          item.stock <= 0 ? "text-red-600" : lowStock ? "text-amber-700" : "text-slate-500"
                        }`}
                      >
                        {item.stock <= 0 ? "Omborda yo'q" : `Qoldiq: ${item.stock}`}
                        {lowStock ? " · kam qoldi" : ""}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500">
                        {getTierPrices(item)
                          ? PRICE_TIER_ORDER.map((tier) => formatCurrency(getServicePrice(item, tier))).join(" / ")
                          : "Narx sozlanmagan"}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-sm font-bold text-slate-700">
                    {isMedicine
                      ? isValidPrice(item.price)
                        ? `${formatCurrency(item.price)}\u00a0so'm`
                        : "Narx yo'q"
                      : getTierPrices(item)
                        ? `${formatCurrency(getServicePrice(item, "first"))}\u00a0so'm`
                        : ""}
                  </span>
                </button>
              );
            })}
            {!catalogItems.length ? (
              <p className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                {catalogTab === "medicines" ? "Dori topilmadi" : "Xizmat topilmadi"}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="card p-4 lg:sticky lg:top-20">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Chek</h2>
            <span className="text-xs font-semibold text-slate-500">{selectedCount} ta tanlangan</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-600">
            {patient.fullName ? patient.fullName : <span className="text-slate-400">Bemor kiritilmagan</span>}
          </p>

          <div className="mt-3 space-y-2">
            {previewMedicines.map((line) => {
              const medicine = medicines.find((m) => m._id === line.id);
              const max = Math.max(Number(medicine?.stock || 1), 1);
              return (
                <div
                  key={line.id}
                  data-field={`nurse-line-${line.id}`}
                  className="sampi-field-box rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold text-slate-800">{line.name}</p>
                    <button
                      type="button"
                      aria-label="Olib tashlash"
                      onClick={() => toggleMedicine(line.id, true)}
                      className="shrink-0 text-lg leading-none text-slate-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <QuantityStepper
                      value={line.quantity}
                      max={max}
                      onChange={(next) =>
                        setMedicineInputs((prev) => ({ ...prev, [line.id]: { quantity: safeQty(next, max) } }))
                      }
                    />
                    <span className="whitespace-nowrap text-sm font-bold text-slate-800">
                      {formatCurrency(line.lineTotal)}{"\u00a0"}so'm
                    </span>
                  </div>
                </div>
              );
            })}

            {previewServices.map((line) => (
              <div
                key={line.id}
                data-field={`nurse-line-${line.id}`}
                className="sampi-field-box rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-slate-800">{line.name}</p>
                  <button
                    type="button"
                    aria-label="Olib tashlash"
                    onClick={() => toggleService(line.id, true)}
                    className="shrink-0 text-lg leading-none text-slate-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1.5 inline-flex rounded-md bg-slate-100 p-0.5">
                  {PRICE_TIER_ORDER.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() =>
                        setServiceInputs((prev) => ({
                          ...prev,
                          [line.id]: { quantity: prev[line.id]?.quantity || "1", priceTier: tier }
                        }))
                      }
                      className={`rounded px-2 py-1 text-xs font-bold ${
                        line.tier === tier ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      {PRICE_TIER_LABELS[tier]}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <QuantityStepper
                    value={line.quantity}
                    onChange={(next) =>
                      setServiceInputs((prev) => ({
                        ...prev,
                        [line.id]: { quantity: safeQty(next), priceTier: prev[line.id]?.priceTier || "first" }
                      }))
                    }
                  />
                  <span className="whitespace-nowrap text-sm font-bold text-slate-800">
                    {formatCurrency(line.lineTotal)}{"\u00a0"}so'm
                  </span>
                </div>
              </div>
            ))}

            {!hasAnySelection ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                Chapdan dori yoki xizmat tanlang
              </p>
            ) : null}
          </div>

          {hasAnySelection ? (
            <button
              type="button"
              onClick={clearSelection}
              className="mt-2 w-full text-center text-xs font-semibold text-slate-500 hover:text-red-600"
            >
              Hammasini tozalash
            </button>
          ) : null}
        </aside>
      </div>

      {/* LOR qabulidagi kabi: chek tugmasi ekran tagiga yopishgan, tanlov qancha bo'lmasin ko'rinadi. */}
      <div className="sticky bottom-0 z-30 mt-auto rounded-t-xl border border-b-0 border-slate-200 bg-white p-3 shadow-[0_-6px_24px_rgba(15,23,42,0.12)] sm:p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            {patient.fullName.trim() ? (
              <p className="truncate text-sm font-bold text-slate-900">{patient.fullName}</p>
            ) : (
              <p className="truncate text-sm font-bold text-amber-700">Bemor F.I.O kiritilmagan</p>
            )}
            <p className="text-xs font-semibold text-slate-500">{selectedCount} ta tanlangan</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-500">Jami</p>
            <p className="whitespace-nowrap text-2xl font-black leading-tight text-slate-900">
              {formatCurrency(previewTotal)} so'm
            </p>
          </div>
          <Button
            className="min-h-12 w-full text-base sm:w-auto sm:min-w-60"
            disabled={!hasAnySelection}
            loading={submitting}
            loadingText="Chek yaratilmoqda..."
            onClick={handleCheckout}
          >
            Chek chiqarish
          </Button>
        </div>
      </div>

      <PrintingOverlay show={submitting} text="Chek tayyorlanmoqda" />
    </div>
  );
}

export default NurseDashboard;
