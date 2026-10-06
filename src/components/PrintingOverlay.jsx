import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Chek tayyor bo'lgach "Chek tayyor" holati shuncha vaqt ko'rinib turadi.
const DONE_MS = 900;
const PAPER_LINES = ["w-4/5", "w-3/5", "w-full", "w-2/3", "w-full", "w-1/2"];

// Chek chiqayotganda printerdan qog'oz chiqib kelayotgandek animatsiya.
// body ga portal qilinadi: sahifa animatsiyasining !important qoidalari bunga tegmaydi.
function PrintingOverlay({ show = false, text = "Chek tayyorlanmoqda", doneText = "Chek tayyor" }) {
  const [prevShow, setPrevShow] = useState(show);
  const [done, setDone] = useState(false);

  if (show !== prevShow) {
    setPrevShow(show);
    setDone(!show);
  }

  useEffect(() => {
    if (!done) return undefined;
    const timer = window.setTimeout(() => setDone(false), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  if (!show && !done) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`sampi-print-overlay ${done ? "is-done" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="sampi-print-card">
        <div className="sampi-printer" aria-hidden="true">
          <div className="sampi-printer-body">
            <span className="sampi-printer-led" />
            <span className="sampi-printer-slot" />
          </div>
          <div className="sampi-printer-window">
            <div className="sampi-printer-paper">
              <span className="sampi-printer-paper-head" />
              {PAPER_LINES.map((width, index) => (
                <span
                  key={index}
                  className={`sampi-printer-paper-line ${width}`}
                  style={{ "--line-delay": `${180 + index * 120}ms` }}
                />
              ))}
              <span className="sampi-printer-paper-total" />
            </div>
          </div>
          <span className="sampi-printer-check">✓</span>
        </div>
        <p className="sampi-print-text">
          {done ? doneText : text}
          {done ? null : (
            <span className="sampi-loader-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
        </p>
      </div>
    </div>,
    document.body
  );
}

export default PrintingOverlay;
