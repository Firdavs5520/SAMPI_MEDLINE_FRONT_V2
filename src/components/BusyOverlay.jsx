import { createPortal } from "react-dom";

function BusyOverlay({ show = false, text = "Jarayon davom etmoqda..." }) {
  if (!show) return null;

  return createPortal(
    <div className="sampi-modal-overlay fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/55 backdrop-blur-[1.5px]">
      <div className="sampi-busy-panel mx-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-200">
        <span className="sampi-spin-dot h-5 w-5 rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-semibold text-slate-700">{text}</p>
      </div>
    </div>,
    document.body
  );
}

export default BusyOverlay;
