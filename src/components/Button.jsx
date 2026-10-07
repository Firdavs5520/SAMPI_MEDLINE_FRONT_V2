import { useEffect, useState } from "react";

const DONE_MS = 1600;

// succeeded: amal (loading true -> false) muvaffaqiyatli tugaganini bildiradi. Shunda tugma
// qisqa vaqt ✓ va successText ("Saqlandi") ko'rsatadi, keyin asl holiga qaytadi.
function Button({
  children,
  type = "button",
  loading = false,
  loadingText = "Yuklanmoqda...",
  disabled = false,
  variant = "primary",
  className = "",
  succeeded,
  successText = "Saqlandi",
  ...props
}) {
  const [prevLoading, setPrevLoading] = useState(loading);
  const [done, setDone] = useState(false);

  if (loading !== prevLoading) {
    setPrevLoading(loading);
    if (!loading && succeeded) setDone(true);
    if (loading) setDone(false);
  }

  useEffect(() => {
    if (!done) return undefined;
    const timer = window.setTimeout(() => setDone(false), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  const variants = {
    primary:
      "bg-primary text-white hover:bg-primary-dark focus:ring-primary/40 disabled:bg-slate-300",
    secondary:
      "bg-slate-200 text-slate-700 hover:bg-slate-300 focus:ring-slate-300 disabled:bg-slate-100",
    danger:
      "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-300 disabled:bg-rose-300",
    accent:
      "bg-accent text-white hover:bg-orange-600 focus:ring-orange-300 disabled:bg-orange-300"
  };

  return (
    <button
      type={type}
      disabled={loading || disabled}
      className={`sampi-btn inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${done ? "sx-btn-done" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="sampi-btn-spinner h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
          {loadingText}
        </span>
      ) : done ? (
        <span className="sx-btn-done-label inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="sx-btn-check h-4 w-4" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {successText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
