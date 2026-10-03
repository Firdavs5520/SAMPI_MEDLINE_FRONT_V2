import { useEffect, useState } from "react";

const BUTTON_CLASS =
  "sampi-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-primary outline-none transition hover:bg-slate-100 focus:border-primary focus:ring-2 focus:ring-primary/10";

const getDesktopApi = () => {
  const desktop = typeof window !== "undefined" ? window.sampiDesktop : null;
  return typeof desktop?.toggleFullscreen === "function" ? desktop : null;
};

const canUseDocumentFullscreen = () =>
  typeof document !== "undefined" &&
  Boolean(document.fullscreenEnabled && document.documentElement?.requestFullscreen);

function EnterFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

// Desktop ilovada butun oyna to'liq ekranga o'tadi; sayt/PWA da brauzerning Fullscreen API'si.
function FullscreenButton() {
  const desktop = getDesktopApi();
  const supported = Boolean(desktop) || canUseDocumentFullscreen();
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false
  );

  useEffect(() => {
    if (desktop) {
      let active = true;
      desktop
        .isFullscreen?.()
        .then((value) => {
          if (active) setIsFullscreen(Boolean(value));
        })
        .catch(() => {});
      const unsubscribe = desktop.onFullscreenChange?.(setIsFullscreen);
      return () => {
        active = false;
        unsubscribe?.();
      };
    }

    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [desktop]);

  if (!supported) return null;

  const handleToggle = async () => {
    try {
      if (desktop) {
        setIsFullscreen(Boolean(await desktop.toggleFullscreen()));
        return;
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      // Brauzer ruxsat bermasa, hech narsa qilinmaydi.
    }
  };

  const label = isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran";

  return (
    <button type="button" onClick={handleToggle} className={BUTTON_CLASS} title={label} aria-label={label}>
      {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
    </button>
  );
}

function ReloadButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className={BUTTON_CLASS}
      title="Sahifani yangilash"
      aria-label="Sahifani yangilash"
    >
      <ReloadIcon />
    </button>
  );
}

function WindowControls() {
  return (
    <>
      <ReloadButton />
      <FullscreenButton />
    </>
  );
}

export default WindowControls;
