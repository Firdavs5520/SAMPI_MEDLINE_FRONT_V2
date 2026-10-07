import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import Input from "../components/Input.jsx";
import { showFieldError } from "../utils/fieldError.js";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import usageService from "../services/usageService.js";
import { extractErrorMessage, toTitleCaseName } from "../utils/format.js";

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

function RoleSpecialistsPage({ mode = "nurse" }) {
  const isNurse = mode === "nurse";
  const roleLabel = isNurse ? "Hamshira" : "Doktor";
  const sectionLabel = isNurse ? "Hamshiralar" : "Doktorlar";
  const theme = isNurse
    ? {
        header: "border-rose-200 bg-rose-50/70",
        accent: "bg-rose-600 hover:bg-rose-700 focus:ring-rose-300",
        badge: "border-rose-200 bg-rose-100 text-rose-700"
      }
    : {
        header: "border-sky-200 bg-sky-50/70",
        accent: "bg-sky-600 hover:bg-sky-700 focus:ring-sky-300",
        badge: "border-sky-200 bg-sky-100 text-sky-700"
      };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [togglingProId, setTogglingProId] = useState("");

  const [specialists, setSpecialists] = useState([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return specialists;
    return specialists.filter((item) => normalizeSearch(item?.name).includes(q));
  }, [specialists, search]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await usageService.getRoleSpecialists();
      setSpecialists(data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (saving) return;

    resetMessages();
    const safeName = toTitleCaseName(newName).trim();
    if (!safeName) {
      showFieldError("specialist-new-name", `${roleLabel} nomini kiriting.`);
      return;
    }

    setSaving(true);
    try {
      await usageService.createRoleSpecialist({ name: safeName });
      setSuccess(`Yangi ${roleLabel.toLowerCase()} qo'shildi.`);
      setNewName("");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setEditingName(item.name || "");
    resetMessages();
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditingName("");
  };

  const saveEdit = async (id) => {
    if (!id || updating) return;

    resetMessages();
    const safeName = toTitleCaseName(editingName).trim();
    if (!safeName) {
      showFieldError("specialist-edit-name", `${roleLabel} nomini kiriting.`);
      return;
    }

    setUpdating(true);
    try {
      await usageService.updateRoleSpecialist(id, { name: safeName });
      setSuccess(`${roleLabel} ma'lumoti yangilandi.`);
      cancelEdit();
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  // Pro doktor: LOR doktor tanlash sahifasida o'rtada, oltin rangda turadi.
  const togglePro = async (item) => {
    if (!item?._id || togglingProId) return;
    resetMessages();
    setTogglingProId(item._id);
    try {
      await usageService.updateRoleSpecialist(item._id, { pro: !item.pro });
      setSpecialists((prev) => prev.map((row) => (row._id === item._id ? { ...row, pro: !item.pro } : row)));
      setSuccess(item.pro ? `${item.name} pro'dan olindi.` : `${item.name} pro doktor qilindi.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setTogglingProId("");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?._id || deletingId) return;
    resetMessages();
    setDeletingId(deleteTarget._id);

    try {
      await usageService.deleteRoleSpecialist(deleteTarget._id);
      setSuccess(`${roleLabel} o'chirildi.`);
      if (editingId === deleteTarget._id) {
        cancelEdit();
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeletingId("");
    }
  };

  if (loading) {
    return <Spinner page text={`${sectionLabel} yuklanmoqda...`} />;
  }

  return (
    <div className="space-y-6">
      <div className={`card p-4 sm:p-5 ${theme.header}`}>
        <h1 className="text-xl font-bold text-slate-800">{sectionLabel}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Bu bo'limda {roleLabel.toLowerCase()} qo'shish, tahrirlash va o'chirish mumkin.
        </p>
      </div>

      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-800">Yangi {roleLabel.toLowerCase()} qo'shish</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={handleAdd}>
          <Input
            field="specialist-new-name"
            label={`${roleLabel} nomi`}
            value={newName}
            placeholder={`Masalan: ${roleLabel} Aziz`}
            onChange={(e) => setNewName(toTitleCaseName(e.target.value))}
          />
          <Button type="submit" loading={saving} succeeded={Boolean(success)} successText="Qo'shildi" className={`h-fit w-full self-end ${theme.accent} md:w-auto`}>
            Qo'shish
          </Button>
        </form>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Input
            label={`${roleLabel} qidirish`}
            value={search}
            placeholder={`Masalan: ${roleLabel} 1`}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="button" variant="secondary" className="h-fit w-full md:w-auto" onClick={() => setSearch("")}>
            Tozalash
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300">
            <EmptyState title="Ma'lumot topilmadi" hint="Yuqoridagi formadan yangisini qo'shing." />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const isEditing = editingId === item._id;
              return (
                <div
                  key={item._id}
                  className="rounded-lg border border-slate-200 bg-white p-3 transition-colors duration-150 hover:border-slate-300"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        field="specialist-edit-name"
                        label={`${roleLabel} nomi`}
                        value={editingName}
                        onChange={(e) => setEditingName(toTitleCaseName(e.target.value))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          loading={updating} succeeded={Boolean(success)} successText="Saqlandi"
                          className={`px-3 py-1.5 text-xs ${theme.accent}`}
                          onClick={() => saveEdit(item._id)}
                        >
                          Saqlash
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={cancelEdit}
                          disabled={updating}
                        >
                          Bekor qilish
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        {item.pro ? (
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                            ★ Pro
                          </span>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${theme.badge}`}>
                            {mode}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Yaratilgan: {new Date(item.createdAt).toLocaleString("uz-UZ")}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => startEdit(item)}
                          disabled={Boolean(deletingId)}
                        >
                          Tahrirlash
                        </Button>
                        {!isNurse ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className={`px-3 py-1.5 text-xs ${item.pro ? "text-amber-700" : ""}`}
                            onClick={() => togglePro(item)}
                            loading={togglingProId === item._id}
                            disabled={Boolean(togglingProId) && togglingProId !== item._id}
                          >
                            {item.pro ? "Pro'dan olish" : "★ Pro qilish"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="danger"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            resetMessages();
                            setDeleteTarget(item);
                          }}
                          loading={deletingId === item._id}
                          disabled={Boolean(deletingId) && deletingId !== item._id}
                        >
                          O'chirish
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={`${roleLabel}ni o'chirish`}
        description={
          deleteTarget
            ? `${deleteTarget.name} nomli ${roleLabel.toLowerCase()}ni o'chirmoqchimisiz?`
            : ""
        }
        confirmText="Ha, o'chirish"
        cancelText="Yo'q"
        loading={Boolean(deleteTarget?._id) && deletingId === deleteTarget._id}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!deletingId) {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}

export default RoleSpecialistsPage;
