import { useEffect, useMemo, useState } from "react";
import medicineService from "../services/medicineService.js";
import Input from "../components/Input.jsx";
import { fieldError, showFieldErrorFrom } from "../utils/fieldError.js";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Spinner from "../components/Spinner.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import {
  extractErrorMessage,
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput
} from "../utils/format.js";

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

function DeliveryDashboard() {
  const [loading, setLoading] = useState(true);
  const [savingStock, setSavingStock] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [selectedMedicineIds, setSelectedMedicineIds] = useState([]);
  const [selectedInputs, setSelectedInputs] = useState({});
  const [medicineSearch, setMedicineSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const sectionTheme = {
    headerCard: "border-cyan-200 bg-cyan-50/70",
    badge: "bg-cyan-100 text-cyan-800 border border-cyan-200",
    alertBox: "border-cyan-200 bg-cyan-50 text-cyan-800",
    formCard: "border-cyan-200",
    submitButton: "bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-300"
  };

  const sortedMedicines = useMemo(
    () =>
      [...medicines].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), "uz")
      ),
    [medicines]
  );

  const filteredMedicines = useMemo(() => {
    const query = normalizeSearch(medicineSearch);
    if (!query) return sortedMedicines;

    return sortedMedicines.filter((medicine) =>
      normalizeSearch(medicine?.name).includes(query)
    );
  }, [medicineSearch, sortedMedicines]);

  const loadMedicines = async () => {
    setLoading(true);
    try {
      const data = await medicineService.getAllMedicines();
      setMedicines(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const toggleMedicine = (medicineId) => {
    setSelectedMedicineIds((prev) => {
      const exists = prev.includes(medicineId);
      if (exists) {
        return prev.filter((id) => id !== medicineId);
      }

      setSelectedInputs((prevInputs) => ({
        ...prevInputs,
        [medicineId]: {
          quantity: prevInputs[medicineId]?.quantity || "1"
        }
      }));

      return [...prev, medicineId];
    });
  };

  const updateSelectedInput = (medicineId, value) => {
    setSelectedInputs((prev) => ({
      ...prev,
      [medicineId]: {
        quantity: formatMoneyInput(value, 4)
      }
    }));
  };

  const handleBatchRestock = async () => {
    if (savingStock) return;

    resetMessages();
    setSavingStock(true);

    try {
      if (selectedMedicineIds.length === 0) {
        throw fieldError("delivery-search", "Kamida bitta dori tanlang.");
      }

      const items = selectedMedicineIds.map((medicineId) => {
        const quantity = parseMoneyInput(selectedInputs[medicineId]?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw fieldError(`delivery-qty-${medicineId}`, "Miqdor 0 dan katta bo'lishi kerak.");
        }

        return {
          medicineId,
          quantity
        };
      });

      await medicineService.increaseStockBulk(items);

      setSuccess(
        `${items.length} ta dori bo'yicha ombor qoldig'i muvaffaqiyatli oshirildi.`
      );
      setSelectedMedicineIds([]);
      setSelectedInputs({});
      await loadMedicines();
    } catch (err) {
      if (!showFieldErrorFrom(err)) {
        setError(extractErrorMessage(err));
      }
    } finally {
      setSavingStock(false);
    }
  };

  if (loading) {
    return <Spinner page text="Delivery panel yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className={`card p-4 sm:p-5 ${sectionTheme.formCard}`}>
        <h2 className="text-lg font-semibold text-slate-800">1-qadam: Dorilarni tanlang</h2>
        <p className="mb-4 text-sm text-slate-500">
          Bir nechta dorini bosib tanlang, keyin hammasiga birdaniga miqdor qo'shing.
        </p>

        <div className="mb-4" data-field="delivery-search">
          <QuickSearchInput
            label="Dori qidirish"
            placeholder="Masalan: Ceftriaxone"
            value={medicineSearch}
            onChange={setMedicineSearch}
            items={sortedMedicines}
            getItemLabel={(item) => item?.name || ""}
            onPick={(medicine) => {
              setMedicineSearch(medicine?.name || "");
            }}
            emptyText="Mos dori topilmadi"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredMedicines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 sm:col-span-2 xl:col-span-3">
              Qidiruv bo'yicha dori topilmadi.
            </div>
          ) : null}

          {filteredMedicines.map((medicine) => {
            const selected = selectedMedicineIds.includes(medicine._id);
            return (
              <button
                key={medicine._id}
                type="button"
                onClick={() => toggleMedicine(medicine._id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  selected
                    ? "border-primary bg-cyan-50"
                    : "border-slate-200 bg-white hover:border-primary/50"
                }`}
              >
                <p className="font-semibold text-slate-800">{medicine.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Ho'zirgi qoldiq: {formatCurrency(medicine.stock)}
                </p>
                <p className="text-xs text-slate-500">
                  Narx: {medicine.price ? formatCurrency(medicine.price) : "-"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedMedicineIds.length > 0 ? (
        <div className={`card p-4 sm:p-5 ${sectionTheme.formCard}`}>
          <h2 className="text-lg font-semibold text-slate-800">
            2-qadam: Tanlangan dorilar miqdorini kiriting
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Har bir tanlangan doriga keltirilgan miqdorni yo'zing.
          </p>

          <div className="space-y-3">
            {selectedMedicineIds.map((medicineId) => {
              const medicine = sortedMedicines.find((item) => item._id === medicineId);
              const input = selectedInputs[medicineId] || {};

              return (
                <div
                  key={medicineId}
                  className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_180px_auto]"
                >
                  <div>
                    <p className="font-medium text-slate-800">{medicine?.name}</p>
                    <p className="text-xs text-slate-500">
                      Ho'zirgi qoldiq: {formatCurrency(medicine?.stock)}
                    </p>
                  </div>

                  <Input
                    field={`delivery-qty-${medicineId}`}
                    label="Keltirilgan miqdor"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={input.quantity || ""}
                    onChange={(e) => updateSelectedInput(medicineId, e.target.value)}
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-fit self-end"
                    onClick={() => toggleMedicine(medicineId)}
                  >
                    Olib tashlash
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Button
              loading={savingStock} succeeded={Boolean(success)} successText="Saqlandi"
              onClick={handleBatchRestock}
              className={`w-full sm:w-auto ${sectionTheme.submitButton}`}
            >
              Omborga qo'shish
            </Button>
          </div>
        </div>
      ) : (
        <div className={`card p-4 sm:p-5 ${sectionTheme.formCard}`}>
          <p className="text-sm text-slate-600">
            Miqdor kiritish bo'limi chiqishi uchun avval dorilarni tanlang.
          </p>
        </div>
      )}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className={`card p-4 sm:p-5 ${sectionTheme.formCard}`}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Dorilar ro'yxati</h2>
        <Table
          data={sortedMedicines}
          columns={[
            { key: "name", label: "Nomi" },
            {
              key: "price",
              label: "Narxi",
              render: (row) => formatCurrency(row.price)
            },
            {
              key: "stock",
              label: "Qoldiq",
              render: (row) => {
                const stock = Number(row.stock) || 0;
                const tone = stock <= 0 ? "sx-dot-danger" : stock <= 10 ? "sx-dot-warning" : "";
                return (
                  <span className="whitespace-nowrap">
                    {tone ? <span className={`sx-dot ${tone}`} aria-hidden="true" /> : null}
                    {formatCurrency(stock)}
                  </span>
                );
              }
            },
            {
              key: "status",
              label: "Holat",
              render: (row) =>
                row.stock > 0 ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Bor
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    QOLMADI
                  </span>
                )
            }
          ]}
        />
      </div>
    </div>
  );
}

export default DeliveryDashboard;
