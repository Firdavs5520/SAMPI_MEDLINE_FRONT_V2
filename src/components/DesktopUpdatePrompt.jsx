import { useEffect, useRef, useState } from "react";
import Button from "./Button.jsx";

const getDesktopUpdater = () => {
  const desktop = typeof window !== "undefined" ? window.sampiDesktop : null;
  return typeof desktop?.getUpdateState === "function" ? desktop : null;
};

const formatMegabytes = (bytes) => `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;

// Desktop ilovada yangi versiya chiqsa: ruxsat so'raladi, foiz bilan yuklanadi, keyin o'rnatiladi.
// TV ekranida bosadigan odam yo'q, shuning uchun u yerda yangilanish o'zi yuklanib o'rnatiladi.
function DesktopUpdatePrompt({ unattended = false }) {
  const desktop = getDesktopUpdater();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!desktop) return undefined;
    let active = true;
    desktop
      .getUpdateState()
      .then((value) => {
        if (active) setState(value);
      })
      .catch(() => {});
    const unsubscribe = desktop.onUpdateState?.((value) => setState(value));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop || !unattended || !state) return;
    if (state.status === "available" && !autoStartedRef.current) {
      autoStartedRef.current = true;
      desktop.downloadUpdate().catch(() => {});
    } else if (state.status === "downloaded") {
      desktop.installUpdate().catch(() => {});
    }
  }, [desktop, unattended, state]);

  if (!desktop || !state || unattended) return null;
  if (state.status === "idle" || (state.status === "available" && state.snoozed)) return null;

  const run = async (action) => {
    setBusy(true);
    try {
      const next = await action();
      if (next && typeof next === "object") setState(next);
    } catch {
      // Holat "sampi:update-state" orqali yangilanadi.
    } finally {
      setBusy(false);
    }
  };

  const versionLabel = state.version ? `v${state.version}` : "Yangi versiya";

  return (
    <div
      className="fixed bottom-12 right-3 z-[70] w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl print:hidden"
      role="status"
      aria-live="polite"
    >
      {state.status === "available" ? (
        <>
          <div className="text-sm font-black text-slate-900">{versionLabel} chiqdi</div>
          <p className="mt-1 text-xs text-slate-500">
            Hozirgi versiya: v{state.currentVersion}. Yangilanishni yuklab olaymi?
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" className="px-3 py-2 text-xs" disabled={busy} onClick={() => run(desktop.snoozeUpdate)}>
              Keyinroq
            </Button>
            <Button className="px-3 py-2 text-xs" loading={busy} onClick={() => run(desktop.downloadUpdate)}>
              Yuklab olish
            </Button>
          </div>
        </>
      ) : null}

      {state.status === "downloading" ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-black text-slate-900">{versionLabel} yuklanmoqda</div>
            <div className="text-sm font-black text-primary">{state.percent}%</div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${state.percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {state.total ? `${formatMegabytes(state.transferred)} / ${formatMegabytes(state.total)}` : "Boshlanmoqda..."}
            {state.bytesPerSecond ? ` · ${formatMegabytes(state.bytesPerSecond)}/s` : ""}
          </p>
        </>
      ) : null}

      {state.status === "downloaded" ? (
        <>
          <div className="text-sm font-black text-slate-900">{versionLabel} yuklandi</div>
          <p className="mt-1 text-xs text-slate-500">
            O'rnatish uchun ilova bir necha soniyaga yopilib, qayta ochiladi. Hozir o'rnatilmasa, ilova yopilganda o'rnatiladi.
          </p>
          <div className="mt-3 flex justify-end">
            <Button className="px-3 py-2 text-xs" loading={busy} loadingText="O'rnatilmoqda..." onClick={() => run(desktop.installUpdate)}>
              Hozir o'rnatish
            </Button>
          </div>
        </>
      ) : null}

      {state.status === "error" ? (
        <>
          <div className="text-sm font-black text-rose-600">Yangilanishni yuklab bo'lmadi</div>
          <p className="mt-1 break-words text-xs text-slate-500">{state.error || "Internetni tekshirib, qayta urinib ko'ring."}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" className="px-3 py-2 text-xs" disabled={busy} onClick={() => run(desktop.snoozeUpdate)}>
              Keyinroq
            </Button>
            <Button className="px-3 py-2 text-xs" loading={busy} onClick={() => run(desktop.downloadUpdate)}>
              Qayta urinish
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default DesktopUpdatePrompt;
