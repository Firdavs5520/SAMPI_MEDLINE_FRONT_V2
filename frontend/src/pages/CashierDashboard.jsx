import { useEffect, useMemo, useState } from "react";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import cashierService from "../services/cashierService.js";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const departmentLabels = {
  lor: "LOR",
  procedure: "Protsedura"
};

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const createInitialForm = (date = getTodayString()) => ({
  department: "lor",
  patientName: "",
  amount: "",
  specialistName: "",
  patientPhone: "",
  note: "",
  entryDate: date
});

const emptySummary = {
  totalAmount: 0,
  totalEntries: 0,
  byDepartment: {
    lor: { totalAmount: 0, count: 0 },
    procedure: { totalAmount: 0, count: 0 }
  }
};

function SummaryCard({ title, amount, count, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    primary: "border-cyan-200 bg-cyan-50",
    accent: "border-orange-200 bg-orange-50"
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{formatCurrency(amount)} so'm</p>
      <p className="mt-1 text-sm text-slate-600">Yozuvlar: {count}</p>
    </div>
  );
}

function CashierDashboard() {
  const today = useMemo(() => getTodayString(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [filters, setFilters] = useState({
    date: today,
    department: "all",
    search: ""
  });
  const [searchInput, setSearchInput] = useState("");
  const [form, setForm] = useState(createInitialForm(today));
  const [editingEntry, setEditingEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const [entriesPayload, summaryPayload] = await Promise.all([
        cashierService.getEntries(filters),
        cashierService.getSummary(filters)
      ]);

      setEntries(entriesPayload?.entries || []);
      setSummary(summaryPayload || emptySummary);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [filters.date, filters.department, filters.search]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setEditingEntry(null);
    setForm(createInitialForm(filters.date));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    resetMessages();
    setSaving(true);

    try {
      const payload = {
        department: form.department,
        patientName: form.patientName,
        amount: Number(form.amount),
        specialistName: form.specialistName,
        patientPhone: form.patientPhone,
        note: form.note,
        entryDate: form.entryDate
      };

      if (editingEntry?._id) {
        await cashierService.updateEntry(editingEntry._id, payload);
        setSuccess("Kassa yozuvi yangilandi.");
      } else {
        await cashierService.createEntry(payload);
        setSuccess("Kassa yozuvi qo'shildi.");
      }

      resetForm();
      await loadData({ silent: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry) => {
    resetMessages();
    setEditingEntry(entry);
    setForm({
      department: entry.department || "lor",
      patientName: entry.patientName || "",
      amount: entry.amount || "",
      specialistName: entry.specialistName || "",
      patientPhone: entry.patientPhone || "",
      note: entry.note || "",
      entryDate: formatDateInput(entry.entryDate)
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget?._id) return;

    setDeleting(true);
    resetMessages();
    try {
      await cashierService.deleteEntry(deleteTarget._id);
      setSuccess("Yozuv o'chirildi.");
      setDeleteTarget(null);
      await loadData({ silent: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
  };

  const tableData = useMemo(
    () => entries.map((entry, index) => ({ ...entry, rowNumber: index + 1 })),
    [entries]
  );

  if (loading) {
    return <Spinner text="Kassa paneli yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">Kassa jurnali</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qog'ozdagi kassa daftarining elektron varianti.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Jami summa"
            amount={summary.totalAmount}
            count={summary.totalEntries}
            tone="primary"
          />
          <SummaryCard
            title="LOR"
            amount={summary.byDepartment?.lor?.totalAmount || 0}
            count={summary.byDepartment?.lor?.count || 0}
          />
          <SummaryCard
            title="Protsedura"
            amount={summary.byDepartment?.procedure?.totalAmount || 0}
            count={summary.byDepartment?.procedure?.count || 0}
            tone="accent"
          />
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Filtr
            </p>
            <div className="mt-2 grid gap-2">
              <Input
                label="Sana"
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, date: e.target.value || today }))
                }
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Bo'lim</span>
                <select
                  value={filters.department}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, department: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="all">Barchasi</option>
                  <option value="lor">LOR</option>
                  <option value="procedure">Protsedura</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-800">
          {editingEntry ? "Yozuvni tahrirlash" : "Yangi kassa yozuvi"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Bemor, summa va shifokor/hamshira ma'lumotini kiriting.
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSave}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Bo'lim</span>
              <select
                value={form.department}
                onChange={(e) => handleFormChange("department", e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="lor">LOR</option>
                <option value="procedure">Protsedura</option>
              </select>
            </label>
            <Input
              label="Sana"
              type="date"
              value={form.entryDate}
              onChange={(e) => handleFormChange("entryDate", e.target.value)}
            />
            <Input
              label="Summa"
              type="number"
              min="1"
              max="999999"
              value={form.amount}
              onChange={(e) => handleFormChange("amount", e.target.value)}
              placeholder="Masalan: 120000"
            />
            <Input
              label="Bemor F.I.O"
              value={form.patientName}
              onChange={(e) => handleFormChange("patientName", e.target.value)}
              placeholder="Masalan: Ali Valiyev"
            />
            <Input
              label="Shifokor/Hamshira"
              value={form.specialistName}
              onChange={(e) => handleFormChange("specialistName", e.target.value)}
              placeholder="Masalan: LOR 1"
            />
            <Input
              label="Telefon (ixtiyoriy)"
              value={form.patientPhone}
              onChange={(e) => handleFormChange("patientPhone", e.target.value)}
              placeholder="Masalan: 90 123 45 67"
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Izoh</span>
            <textarea
              value={form.note}
              onChange={(e) => handleFormChange("note", e.target.value)}
              rows={2}
              placeholder="Qo'shimcha izoh (ixtiyoriy)"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={saving}>
              {editingEntry ? "Yangilash" : "Qo'shish"}
            </Button>
            {editingEntry ? (
              <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>
                Bekor qilish
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Kassa yozuvlari</h2>
            <p className="text-sm text-slate-500">
              Sana: {filters.date} | Bo'lim:{" "}
              {filters.department === "all"
                ? "Barchasi"
                : departmentLabels[filters.department]}
            </p>
          </div>

          <form className="flex w-full gap-2 md:w-auto" onSubmit={handleSearchSubmit}>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Bemor yoki shifokor qidirish..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 md:w-72"
            />
            <Button type="submit" variant="secondary">
              Qidirish
            </Button>
          </form>
        </div>

        <div className="mt-4">
          <Table
            data={tableData}
            columns={[
              { key: "rowNumber", label: "№" },
              { key: "patientName", label: "Bemor F.I.O" },
              {
                key: "department",
                label: "Bo'lim",
                render: (row) => departmentLabels[row.department] || row.department
              },
              {
                key: "amount",
                label: "Summa",
                render: (row) => `${formatCurrency(row.amount)} so'm`
              },
              { key: "specialistName", label: "Shifokor/Hamshira" },
              {
                key: "patientPhone",
                label: "Tel raqam",
                render: (row) => row.patientPhone || "-"
              },
              {
                key: "entryDate",
                label: "Sana",
                render: (row) => formatDateInput(row.entryDate)
              },
              {
                key: "actions",
                label: "Amallar",
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                    >
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                    >
                      O'chirish
                    </button>
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title="Kassa yozuvini o'chirish"
        description={`${deleteTarget?.patientName || "Tanlangan yozuv"} yozuvini o'chirmoqchimisiz?`}
        confirmText="Ha, o'chirish"
        cancelText="Yo'q"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default CashierDashboard;
