import { useEffect, useState } from "react";

const APP_VERSION = __APP_VERSION__;

function AppVersionFooter({ inline = false }) {
  // Desktop ilovada uning o'z versiyasi ham ko'rsatiladi (sayt versiyasidan farq qilishi mumkin).
  const [desktopVersion, setDesktopVersion] = useState("");

  useEffect(() => {
    const getUpdateState = window.sampiDesktop?.getUpdateState;
    if (typeof getUpdateState !== "function") return undefined;
    let active = true;
    getUpdateState()
      .then((state) => {
        if (active) setDesktopVersion(String(state?.currentVersion || ""));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const label = `v${APP_VERSION}${desktopVersion ? ` · ilova ${desktopVersion}` : ""}`;

  // Menyu bor sahifalarda versiya menyuning pastida yoziladi va kontentni yopmaydi.
  if (inline) {
    const canCheck = typeof window !== "undefined" && typeof window.sampiDesktop?.checkForUpdates === "function";
    return (
      <div className="flex flex-col items-start gap-0.5 px-4 pb-3 print:hidden">
        <p className="select-none text-[11px] font-semibold text-slate-400">{label}</p>
        {canCheck ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("sampi:check-desktop-update"))}
            className="text-[11px] font-bold text-cyan-700 hover:underline"
          >
            Yangilanishni tekshirish
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-2 right-3 z-[60] select-none rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-sm backdrop-blur print:hidden">
      {label}
    </div>
  );
}

export default AppVersionFooter;
