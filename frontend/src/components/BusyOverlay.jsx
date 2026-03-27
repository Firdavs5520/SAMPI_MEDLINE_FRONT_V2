function BusyOverlay({ show = false, text = "Jarayon davom etmoqda..." }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 backdrop-blur-[1px]">
      <div className="mx-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-200">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-semibold text-slate-700">{text}</p>
      </div>
    </div>
  );
}

export default BusyOverlay;
