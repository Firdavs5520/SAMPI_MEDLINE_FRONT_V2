import { useEffect, useRef, useState } from "react";

const INSTALL_COUNTDOWN_SECONDS = 3;
const UPDATED_NOTICE_MS = 9000;

const getDesktopUpdater = () => {
  const desktop = typeof window !== "undefined" ? window.sampiDesktop : null;
  return typeof desktop?.getUpdateState === "function" ? desktop : null;
};

const formatMegabytes = (bytes) => `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;

const formatRemaining = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const safe = Math.max(1, Math.round(seconds));
  if (safe < 60) return `${safe} soniya`;
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${minutes} daqiqa ${rest} soniya` : `${minutes} daqiqa`;
};

// Tezlik sakrab turmasligi uchun silliqlanadi, qolgan vaqt shundan hisoblanadi.
const withSmoothedSpeed = (prev, next) => {
  if (!next || next.status !== "downloading") return { ...next, smoothedSpeed: 0 };
  const speed = Number(next.bytesPerSecond) || 0;
  const previous = prev?.status === "downloading" ? Number(prev.smoothedSpeed) || 0 : 0;
  const smoothedSpeed = speed > 0 ? (previous ? previous * 0.7 + speed * 0.3 : speed) : previous;
  return { ...next, smoothedSpeed };
};

const getRemainingSeconds = (state) => {
  if (state?.status !== "downloading" || !state.total || !state.smoothedSpeed) return 0;
  return Math.max(0, state.total - (Number(state.transferred) || 0)) / state.smoothedSpeed;
};

function UpdateIcon({ type }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-5 w-5",
    "aria-hidden": "true"
  };
  if (type === "done") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (type === "error") {
    return (
      <svg {...common}>
        <path d="M12 8v5M12 16.5v.5" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  if (type === "sparkle") {
    return (
      <svg {...common}>
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function VersionChip({ from, to }) {
  return (
    <span className="sampi-update-chip">
      {from ? <span className="sampi-update-chip-old">v{from}</span> : null}
      {from ? <span aria-hidden="true">→</span> : null}
      <span className="sampi-update-chip-new">v{to}</span>
    </span>
  );
}

function InstallOverlay({ state, countdown }) {
  const steps = [
    { key: "downloaded", label: "Yangilanish yuklandi", hint: "", status: "done" },
    {
      key: "closing",
      label: "Ilova yopilmoqda",
      hint: countdown > 0 ? `${countdown} soniyadan keyin` : "Yopilmoqda...",
      status: countdown > 0 ? "active" : "done"
    },
    {
      key: "installing",
      label: "O'rnatilmoqda",
      hint: "taxminan 20–30 soniya",
      status: countdown > 0 ? "pending" : "active"
    },
    { key: "restart", label: "Ilova qayta ochiladi", hint: "o'zi, hech narsa bosish shart emas", status: "pending" }
  ];

  return (
    <div className="sampi-update-overlay" role="alertdialog" aria-live="assertive" aria-label="Yangilanish o'rnatilmoqda">
      <div className="sampi-update-overlay-card">
        <div className="sampi-update-ring" aria-hidden="true">
          <span>{countdown > 0 ? countdown : <UpdateIcon type="sparkle" />}</span>
        </div>
        <div className="mt-4 text-center">
          <div className="text-lg font-black">Yangilanish o'rnatilmoqda</div>
          <div className="mt-1 flex justify-center">
            <VersionChip from={state.currentVersion} to={state.version} />
          </div>
        </div>
        <ol className="sampi-update-steps">
          {steps.map((step) => (
            <li key={step.key} className={`sampi-update-step is-${step.status}`}>
              <span className="sampi-update-step-dot" aria-hidden="true">
                {step.status === "done" ? <UpdateIcon type="done" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{step.label}</span>
                {step.hint ? <span className="block text-xs opacity-70">{step.hint}</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-center text-xs opacity-70">Iltimos, kompyuterni o'chirmang. Ilova taxminan yarim daqiqada qayta ochiladi.</p>
      </div>
    </div>
  );
}

// Desktop ilovada yangi versiya chiqsa: ruxsat so'raladi, foiz va qolgan vaqt bilan yuklanadi,
// o'rnatish bosqichlari ko'rsatiladi, qayta ochilganda "yangilandi" xabari chiqadi.
// TV ekranida bosadigan odam yo'q, shuning uchun u yerda yangilanish o'zi yuklanib o'rnatiladi.
function DesktopUpdatePrompt({ unattended = false }) {
  const desktop = getDesktopUpdater();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!desktop) return undefined;
    let active = true;
    desktop
      .getUpdateState()
      .then((value) => {
        if (active) setState((prev) => withSmoothedSpeed(prev, value));
      })
      .catch(() => {});
    const unsubscribe = desktop.onUpdateState?.((value) => setState((prev) => withSmoothedSpeed(prev, value)));
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

  useEffect(() => {
    if (!desktop || !state?.justUpdated) return undefined;
    const timer = window.setTimeout(() => {
      desktop.ackUpdateNotice?.().catch(() => {});
      setState((prev) => (prev ? { ...prev, justUpdated: null } : prev));
    }, UPDATED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [desktop, state?.justUpdated]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      desktop?.installUpdate().catch(() => setCountdown(null));
      return undefined;
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, desktop]);

  if (!desktop || !state || unattended) return null;

  const run = async (action) => {
    setBusy(true);
    try {
      const next = await action();
      if (next && typeof next === "object") setState((prev) => withSmoothedSpeed(prev, next));
    } catch {
      // Holat "sampi:update-state" orqali yangilanadi.
    } finally {
      setBusy(false);
    }
  };

  if (countdown !== null && state.status === "downloaded") {
    return <InstallOverlay state={state} countdown={countdown} />;
  }

  if (state.justUpdated) {
    return (
      <div className="sampi-update-card sampi-update-card--success" role="status" aria-live="polite">
        <div className="sampi-update-head">
          <span className="sampi-update-icon is-success">
            <UpdateIcon type="done" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="sampi-update-title">Ilova yangilandi</div>
            <VersionChip from={state.justUpdated.from} to={state.justUpdated.to} />
          </div>
          <button
            type="button"
            className="sampi-update-close"
            aria-label="Yopish"
            onClick={() => {
              desktop.ackUpdateNotice?.().catch(() => {});
              setState((prev) => (prev ? { ...prev, justUpdated: null } : prev));
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "idle" || (state.status === "available" && state.snoozed)) return null;

  const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
  const remainingText = formatRemaining(getRemainingSeconds(state));

  return (
    <div className="sampi-update-card" role="status" aria-live="polite">
      {state.status === "available" ? (
        <>
          <div className="sampi-update-head">
            <span className="sampi-update-icon">
              <UpdateIcon type="sparkle" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="sampi-update-title">Yangi versiya tayyor</div>
              <VersionChip from={state.currentVersion} to={state.version} />
            </div>
          </div>
          <p className="sampi-update-text">
            Yangilanish{state.size ? ` (${formatMegabytes(state.size)})` : ""} orqa fonda yuklanadi, ishingizga xalaqit
            bermaydi. O'rnatish vaqtini o'zingiz tanlaysiz.
          </p>
          <div className="sampi-update-actions">
            <button type="button" className="sampi-update-btn is-ghost" disabled={busy} onClick={() => run(desktop.snoozeUpdate)}>
              Keyinroq
            </button>
            <button type="button" className="sampi-update-btn is-primary" disabled={busy} onClick={() => run(desktop.downloadUpdate)}>
              <UpdateIcon type="download" />
              Yangilash
            </button>
          </div>
        </>
      ) : null}

      {state.status === "downloading" ? (
        <>
          <div className="sampi-update-head">
            <span className="sampi-update-icon is-busy">
              <UpdateIcon type="download" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="sampi-update-title">Yuklanmoqda</div>
              <VersionChip from={state.currentVersion} to={state.version} />
            </div>
            <div className="sampi-update-percent">{percent}%</div>
          </div>
          <div className="sampi-update-bar" aria-hidden="true">
            <div className="sampi-update-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="sampi-update-meta">
            <span>{state.total ? `${formatMegabytes(state.transferred)} / ${formatMegabytes(state.total)}` : "Boshlanmoqda..."}</span>
            {state.bytesPerSecond ? <span>{formatMegabytes(state.bytesPerSecond)}/s</span> : null}
          </div>
          <div className="sampi-update-eta">{remainingText ? `Taxminan ${remainingText} qoldi` : "Qolgan vaqt hisoblanmoqda..."}</div>
        </>
      ) : null}

      {state.status === "downloaded" ? (
        <>
          <div className="sampi-update-head">
            <span className="sampi-update-icon is-success">
              <UpdateIcon type="done" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="sampi-update-title">O'rnatishga tayyor</div>
              <VersionChip from={state.currentVersion} to={state.version} />
            </div>
          </div>
          <p className="sampi-update-text">
            O'rnatish taxminan 20–30 soniya oladi: ilova yopiladi va o'zi qayta ochiladi. Hozir o'rnatilmasa, ilova yopilganda
            o'rnatiladi.
          </p>
          <div className="sampi-update-actions">
            <button type="button" className="sampi-update-btn is-primary" onClick={() => setCountdown(INSTALL_COUNTDOWN_SECONDS)}>
              Hozir o'rnatish
            </button>
          </div>
        </>
      ) : null}

      {state.status === "error" ? (
        <>
          <div className="sampi-update-head">
            <span className="sampi-update-icon is-error">
              <UpdateIcon type="error" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="sampi-update-title">Yuklab bo'lmadi</div>
              <div className="sampi-update-text mt-0.5 break-words">{state.error || "Internetni tekshirib, qayta urinib ko'ring."}</div>
            </div>
          </div>
          <div className="sampi-update-actions">
            <button type="button" className="sampi-update-btn is-ghost" disabled={busy} onClick={() => run(desktop.snoozeUpdate)}>
              Keyinroq
            </button>
            <button type="button" className="sampi-update-btn is-primary" disabled={busy} onClick={() => run(desktop.downloadUpdate)}>
              Qayta urinish
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default DesktopUpdatePrompt;
