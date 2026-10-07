import { useCallback, useEffect, useState } from "react";
import AnimatedValue from "../components/AnimatedValue.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import cashierService from "../services/cashierService.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  extractErrorMessage,
  formatCurrency,
  formatShortDateTime,
  formatMoneyInput,
  parseMoneyInput
} from "../utils/format.js";
import { getCurrentShiftYmd } from "../utils/date.js";
import { showFieldError } from "../utils/fieldError.js";

const paymentMethodOptions = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
  { value: "transfer", label: "O'tkazma" }
];

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

const emptyTotals = { total: 0, cash: 0, card: 0, transfer: 0, count: 0 };

function TotalCard({ title, value, hint, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    accent: "border-orange-200 bg-orange-50"
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">
        <AnimatedValue value={value} />
      </p>
      {hint ? <p className="mt-1 text-sm text-slate-600">{hint}</p> : null}
    </div>
  );
}

function CashierExpensesPage() {
  const { role } = useAuth();
  const canWrite = role === "cashier";
  const [today] = useState(() => getCurrentShiftYmd());
  const [date, setDate] = useState(today);
  const [expenses, setExpenses] = useState([]);
  const [totals, setTotals] = useState(emptyTotals);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelingId, setCancelingId] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ amount: "", reason: "", paymentMethod: "cash" });

  const loadExpenses = useCallback(async (targetDate) => {
    setLoading(true);
    setError("");
    try {
      const data = await cashierService.getExpenses(targetDate);
      setExpenses(data?.expenses || []);
      setTotals(data?.totals || emptyTotals);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExpenses(date);
  }, [date, loadExpenses]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const amount = parseMoneyInput(form.amount);
    if (!amount) {
      showFieldError("expense-amount", "Xarajat summasini kiriting.");
      return;
    }
    if (!form.reason.trim()) {
      showFieldError("expense-reason", "Xarajat sababini yozing.");
      return;
    }

    setSaving(true);
    try {
      await cashierService.createExpense({
        amount,
        reason: form.reason.trim(),
        paymentMethod: form.paymentMethod
      });
      setForm({ amount: "", reason: "", paymentMethod: form.paymentMethod });
      setSuccess("Xarajat saqlandi.");
      if (date !== today) {
        setDate(today);
      } else {
        await loadExpenses(today);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    const target = confirmTarget;
    if (!target?._id) return;
    setConfirmTarget(null);
    setError("");
    setSuccess("");
    setCancelingId(target._id);
    try {
      await cashierService.cancelExpense(target._id);
      setSuccess("Xarajat bekor qilindi.");
      await loadExpenses(date);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCancelingId("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">Kutilmagan xarajatlar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kassadan chiqqan rejadan tashqari xarajatlarni yozib boring (masalan, xo'jalik mollari,
          kuryer, ta'mirlash).
        </p>

        {canWrite ? (
          <form
            onSubmit={handleSubmit}
            className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_170px_auto] md:items-end"
          >
            <Input
              field="expense-amount"
              label="Summa (so'm)"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: formatMoneyInput(e.target.value, 8) }))
              }
            />
            <Input
              field="expense-reason"
              label="Sabab"
              type="text"
              maxLength={300}
              placeholder="Nimaga sarflandi?"
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            />
            <SelectMenu
              label="To'lov turi"
              value={form.paymentMethod}
              options={paymentMethodOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, paymentMethod: value }))}
            />
            <Button type="submit" loading={saving} succeeded={Boolean(success)} successText="Qo'shildi" loadingText="Saqlanmoqda..." className="h-fit">
              Qo'shish
            </Button>
          </form>
        ) : null}
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TotalCard
          title="Jami xarajat"
          value={`${formatCurrency(totals.total)}\u00a0so'm`}
          hint={`Yozuvlar: ${totals.count}`}
          tone="accent"
        />
        <TotalCard title="Naqd" value={`${formatCurrency(totals.cash)}\u00a0so'm`} />
        <TotalCard title="Karta" value={`${formatCurrency(totals.card)}\u00a0so'm`} />
        <TotalCard title="O'tkazma" value={`${formatCurrency(totals.transfer)}\u00a0so'm`} />
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-4 max-w-xs">
          <DatePickerField
            label="Smena sanasi"
            value={date}
            onChange={(nextDate) => setDate(nextDate || today)}
          />
        </div>

        {loading ? (
          <Spinner text="Xarajatlar yuklanmoqda..." />
        ) : !expenses.length ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm font-semibold text-slate-500">
            Bu smenada xarajat yozilmagan
          </p>
        ) : (
          <Table
            data={expenses}
            rowClassName={(row) => (row.canceledAt ? "opacity-50 line-through" : "")}
            columns={[
              {
                key: "createdAt",
                label: "Vaqt",
                render: (row) => <span className="whitespace-nowrap">{formatShortDateTime(row.createdAt)}</span>
              },
              {
                key: "amount",
                label: "Summa",
                render: (row) => `${formatCurrency(row.amount)}\u00a0so'm`
              },
              { key: "reason", label: "Sabab", render: (row) => row.reason },
              {
                key: "paymentMethod",
                label: "To'lov turi",
                render: (row) => paymentMethodLabels[row.paymentMethod] || row.paymentMethod
              },
              {
                key: "createdBy",
                label: "Kassir",
                render: (row) => row.createdBy?.name || "-"
              },
              {
                key: "actions",
                label: "Amal",
                render: (row) => {
                  if (row.canceledAt) {
                    return <span className="text-xs font-semibold text-slate-500">Bekor qilingan</span>;
                  }
                  if (!canWrite || date !== today) return "-";
                  return (
                    <Button
                      type="button"
                      variant="secondary"
                      className="whitespace-nowrap px-3 py-1.5 text-xs"
                      loading={cancelingId === row._id}
                      loadingText="..."
                      onClick={() => setConfirmTarget(row)}
                    >
                      Bekor qilish
                    </Button>
                  );
                }
              }
            ]}
          />
        )}
      </div>

      <ConfirmActionModal
        open={Boolean(confirmTarget)}
        title="Xarajatni bekor qilish"
        description={
          confirmTarget
            ? `${formatCurrency(confirmTarget.amount)}\u00a0so'm — "${confirmTarget.reason}" xarajati bekor qilinadi.`
            : ""
        }
        confirmText="Ha, bekor qilish"
        cancelText="Yopish"
        onConfirm={handleCancel}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}

export default CashierExpensesPage;
