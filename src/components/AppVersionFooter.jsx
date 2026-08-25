const APP_VERSION = __APP_VERSION__;

function AppVersionFooter() {
  return (
    <div className="pointer-events-none fixed bottom-2 right-3 z-[60] select-none rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-sm backdrop-blur print:hidden">
      v{APP_VERSION}
    </div>
  );
}

export default AppVersionFooter;
