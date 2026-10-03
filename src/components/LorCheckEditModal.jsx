import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import Button from "./Button.jsx";
import Alert from "./Alert.jsx";
import Spinner from "./Spinner.jsx";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import { extractErrorMessage, formatCurrency, formatDateTime } from "../utils/format.js";
import { getLorCheckEditDeadline } from "../utils/lorCheckEdit.js";

// Eski cheklarda serviceId yo'q: xizmatni nomi bo'yicha topamiz.
const buildInitialSelection = (check, services) => {
  const selection = {};
  (check?.items || []).forEach((item) => {
    if (item?.itemType && item.itemType !== "service") return;
    const byId = item?.serviceId
      ? services.find((service) => String(service._id) === String(item.serviceId))
      : null;
    const byName =
      byId ||
      services.find(
        (service) =>
          String(service.name || "").trim().toLowerCase() ===
          String(item?.name || "").trim().toLowerCase()
      );
    if (byName) {
      selection[String(byName._id)] = Math.max(1, Number(item.quantity) || 1);
    }
  });
  return selection;
};

function LorCheckEditModal({ open, check, currentUserId, onClose, onSaved }) {
  const [services, setServices] = useState([]);
  const [selection, setSelection] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !check) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setSearch("");
      try {
        const allServices = await serviceService.getAllServices();
        if (cancelled) return;
        const lorServices = allServices.filter(
          (item) =>
            item.type === "lor" &&
            (!item.createdBy?.userId || String(item.createdBy.userId) === String(currentUserId))
        );
        setServices(lorServices);
        setSelection(buildInitialSelection(check, lorServices));
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, check, currentUserId]);

  const unmatchedItems = useMemo(() => {
    if (!check || loading) return [];
    const matched = buildInitialSelection(check, services);
    const matchedCount = Object.keys(matched).length;
    const serviceItems = (check.items || []).filter(
      (item) => !item?.itemType || item.itemType === "service"
    );
    return matchedCount < serviceItems.length
      ? serviceItems.filter(
          (item) =>
            !services.some(
              (service) =>
                String(service._id) === String(item.serviceId || "") ||
                String(service.name || "").trim().toLowerCase() ===
                  String(item.name || "").trim().toLowerCase()
            )
        )
      : [];
  }, [check, services, loading]);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? services.filter((service) => String(service.name || "").toLowerCase().includes(query))
      : services;
    return [...list].sort(
      (a, b) =>
        Number(Boolean(selection[String(b._id)])) - Number(Boolean(selection[String(a._id)])) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [services, search, selection]);

  const newTotal = useMemo(
    () =>
      services.reduce((sum, service) => {
        const quantity = selection[String(service._id)] || 0;
        return sum + quantity * Number(service.price || 0);
      }, 0),
    [services, selection]
  );

  const selectedCount = Object.keys(selection).length;
  const paidAmount = Number(check?.cashierStatus?.paidAmount || 0);
  const accepted = Boolean(check?.cashierStatus?.accepted);
  const deadline = getLorCheckEditDeadline(check);
  const belowPaid = accepted && newTotal < paidAmount;

  const toggleService = (serviceId) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[serviceId]) {
        delete next[serviceId];
      } else {
        next[serviceId] = 1;
      }
      return next;
    });
  };

  const changeQuantity = (serviceId, delta) => {
    setSelection((prev) => {
      const current = prev[serviceId] || 0;
      const nextQuantity = Math.min(99, Math.max(1, current + delta));
      return { ...prev, [serviceId]: nextQuantity };
    });
  };

  const handleSave = async ({ print = false } = {}) => {
    if (!check?._id || saving) return;
    setError("");

    if (!selectedCount) {
      setError("Kamida bitta xizmat tanlang.");
      return;
    }
    if (belowPaid) {
      setError(
        `Kassada ${formatCurrency(paidAmount)} so'm to'langan. Yangi summa undan kam bo'lishi mumkin emas.`
      );
      return;
    }

    setSaving(print ? "print" : "save");
    try {
      const updated = await usageService.updateLorCheck(check._id, {
        services: Object.entries(selection).map(([serviceId, quantity]) => ({
          serviceId,
          quantity
        }))
      });
      await onSaved?.(updated, { print });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving("");
    }
  };

  return (
    <Modal
      open={open}
      title="Chekni tahrirlash"
      onClose={saving ? undefined : onClose}
      footer={
        <>
          <div className="mr-auto text-sm font-bold text-slate-700">
            Yangi jami: {formatCurrency(newTotal)} so'm
            {Number(check?.total) !== newTotal ? (
              <span className="ml-2 text-xs font-semibold text-slate-500">
                (avval {formatCurrency(check?.total || 0)} so'm)
              </span>
            ) : null}
          </div>
          <Button type="button" variant="secondary" onClick={onClose} disabled={Boolean(saving)}>
            Bekor qilish
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={saving === "save"}
            loadingText="Saqlanmoqda..."
            disabled={loading || Boolean(saving) || !selectedCount || belowPaid}
            onClick={() => handleSave({ print: false })}
          >
            Saqlash
          </Button>
          <Button
            type="button"
            loading={saving === "print"}
            loadingText="Saqlanmoqda..."
            disabled={loading || Boolean(saving) || !selectedCount || belowPaid}
            onClick={() => handleSave({ print: true })}
          >
            Saqlash va chop etish
          </Button>
        </>
      }
    >
      {check ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-bold text-slate-800">{check.patient?.fullName || "-"}</p>
            <p className="text-xs text-slate-500">
              Chek: {check.checkId || "-"} · Navbat: {check?.lorQueue?.queueCode || "-"}
            </p>
            {deadline ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">
                Tahrirlash mumkin: {formatDateTime(deadline)} gacha
              </p>
            ) : null}
          </div>

          {accepted ? (
            <Alert
              type="info"
              message={`Bu chek kassada qabul qilingan (to'langan: ${formatCurrency(paidAmount)} so'm). Summa oshsa, farqi bemorning qarzi bo'lib qoladi.`}
            />
          ) : null}

          {unmatchedItems.length ? (
            <Alert
              type="info"
              message={`Ro'yxatda topilmagan xizmat(lar): ${unmatchedItems
                .map((item) => item.name)
                .join(", ")}. Saqlasangiz ular chekdan olib tashlanadi.`}
            />
          ) : null}

          <Alert type="error" message={error} />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Xizmat qidirish..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />

          {loading ? (
            <Spinner text="Xizmatlar yuklanmoqda..." />
          ) : (
            <div className="space-y-1.5">
              {visibleServices.map((service) => {
                const serviceId = String(service._id);
                const quantity = selection[serviceId] || 0;
                const selected = quantity > 0;
                return (
                  <div
                    key={serviceId}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                      selected ? "border-primary/60 bg-cyan-50/60" : "border-slate-200 bg-white"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleService(serviceId)}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {service.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatCurrency(service.price)} so'm
                        </span>
                      </span>
                    </label>
                    {selected ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label="Kamaytirish"
                          onClick={() => changeQuantity(serviceId, -1)}
                          disabled={quantity <= 1}
                          className="h-8 w-8 rounded-md bg-slate-200 text-lg font-bold text-slate-700 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-bold">{quantity}</span>
                        <button
                          type="button"
                          aria-label="Oshirish"
                          onClick={() => changeQuantity(serviceId, 1)}
                          className="h-8 w-8 rounded-md bg-slate-200 text-lg font-bold text-slate-700"
                        >
                          +
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!visibleServices.length ? (
                <p className="py-4 text-center text-sm text-slate-500">Xizmat topilmadi</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

export default LorCheckEditModal;
