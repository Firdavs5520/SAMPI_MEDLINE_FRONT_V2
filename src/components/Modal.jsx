import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  panelClassName = "",
  bodyClassName = ""
}) {
  const panelRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusSelector =
      "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

    const focusFirst = () => {
      if (!panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(focusSelector);
      const first = focusable[0];
      if (first instanceof HTMLElement) {
        first.focus();
        return;
      }
      panelRef.current.focus();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll(focusSelector)).filter(
        (node) => node instanceof HTMLElement && !node.hasAttribute("disabled")
      );

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeydown);
    const frame = window.requestAnimationFrame(focusFirst);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      if (lastFocusedRef.current instanceof HTMLElement) {
        lastFocusedRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const modalNode = (
    <div
      className="sampi-modal-overlay fixed inset-0 z-[1200] flex min-h-dvh w-full items-center justify-center bg-slate-950/62 p-3 sm:p-4 backdrop-blur-[2px]"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))"
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sampi-modal-panel w-full max-w-2xl rounded-2xl bg-white shadow-xl ${panelClassName}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <h3 id={titleId} className="text-lg font-semibold text-slate-800">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Oynani yopish"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            &times;
          </button>
        </div>

        <div className={`max-h-[78vh] overflow-y-auto px-4 py-3 sm:max-h-[70vh] sm:px-5 sm:py-4 ${bodyClassName}`}>
          {children}
        </div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}

export default Modal;
