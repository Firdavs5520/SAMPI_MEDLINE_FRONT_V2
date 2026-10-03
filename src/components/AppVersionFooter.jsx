import { useEffect, useState } from "react";

const APP_VERSION = __APP_VERSION__;

function AppVersionFooter() {
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

  return (
    <div className="pointer-events-none fixed bottom-2 right-3 z-[60] select-none rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-sm backdrop-blur print:hidden">
      v{APP_VERSION}
      {desktopVersion ? ` · ilova ${desktopVersion}` : ""}
    </div>
  );
}

export default AppVersionFooter;
