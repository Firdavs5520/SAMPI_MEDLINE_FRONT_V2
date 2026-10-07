import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TOAST_MS = 4500;
const TOAST_ROOT_ID = "sx-toast-root";

const getToastRoot = () => {
  if (typeof document === "undefined") return null;
  let root = document.getElementById(TOAST_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
    root.className = "sx-toast-root";
    document.body.appendChild(root);
  }
  return root;
};

function AlertIcon({ type }) {
  if (type === "success") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path className="sx-alert-check" d="M8 12.5l2.7 2.7L16 9.8" />
      </svg>
    );
  }
  if (type === "error") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </svg>
  );
}

// Muvaffaqiyat xabari: o'ng pastda suzuvchi bildirishnoma (vaqt chizig'i bilan, o'zi yopiladi).
// Xato va ma'lumot xabarlari: o'z joyida, belgili.
function Alert({ type = "info", message }) {
  const [dismissed, setDismissed] = useState("");

  // Xabar tozalansa, keyingi safar xuddi shu matn qaytsa ham yana ko'rsatiladi.
  if (!message && dismissed) {
    setDismissed("");
  }

  useEffect(() => {
    if (type !== "success" || !message) return undefined;
    const timer = window.setTimeout(() => setDismissed(message), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [type, message]);

  if (!message) return null;

  const variants = {
    info: "border-blue-200 bg-blue-50 text-blue-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-rose-200 bg-rose-50 text-rose-700"
  };

  if (type === "success") {
    if (dismissed === message) return null;
    const root = getToastRoot();
    if (!root) return null;
    return createPortal(
      <div className="sx-toast" role="status" aria-live="polite" key={message}>
        <span className="sx-alert-icon sx-alert-icon-success">
          <AlertIcon type="success" />
        </span>
        <span className="sx-toast-text">{message}</span>
        <button
          type="button"
          className="sx-toast-close"
          aria-label="Yopish"
          onClick={() => setDismissed(message)}
        >
          ×
        </button>
        <span className="sx-toast-timer" style={{ "--sx-toast-ms": `${TOAST_MS}ms` }} aria-hidden="true" />
      </div>,
      root
    );
  }

  return (
    <div
      className={`sampi-alert flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${variants[type]} ${
        type === "error" ? "sx-alert-error" : ""
      }`}
      role={type === "error" ? "alert" : "status"}
    >
      <span className={`sx-alert-icon sx-alert-icon-${type}`}>
        <AlertIcon type={type} />
      </span>
      <span className="min-w-0 flex-1 pt-px">{message}</span>
    </div>
  );
}

export default Alert;
