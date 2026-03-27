import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

function ConfirmActionModal({
  open,
  title = "Tasdiqlash",
  description = "",
  confirmText = "Tasdiqlash",
  cancelText = "Bekor qilish",
  loading = false,
  onConfirm,
  onClose
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      panelClassName="max-w-lg"
      bodyClassName="space-y-4"
    >
      <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-700">
          !
        </div>
        <div>
          <p className="text-sm font-semibold text-rose-700">{description}</p>
          <p className="mt-1 text-xs text-rose-600">Bu amal qaytarilmaydi.</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} loading={loading}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmActionModal;
