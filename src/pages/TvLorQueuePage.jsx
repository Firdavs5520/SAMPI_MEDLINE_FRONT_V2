import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import tvService from "../services/tvService.js";
import { extractErrorMessage } from "../utils/format.js";

const POLL_INTERVAL_MS = 4000;
const CLOCK_INTERVAL_MS = 1000;
const KIOSK_READY_KEY = "sampi_tv_kiosk_ready";

const roomToneClass = {
  lor1: "sampi-tv-room-cyan",
  lor2: "sampi-tv-room-amber",
  lor: "sampi-tv-room-emerald"
};

const formatClock = (value = new Date()) =>
  new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);

const formatTime = (value) => {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const formatWaiting = (minutes) => {
  const safeMinutes = Number(minutes);
  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) return "hozir";
  if (safeMinutes < 60) return `${safeMinutes} daqiqa`;
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return rest ? `${hours} soat ${rest} daqiqa` : `${hours} soat`;
};

const getSupportedLorIdentity = (value) => {
  const safe = String(value || "all").trim().toLowerCase();
  return ["lor1", "lor2"].includes(safe) ? safe : "all";
};

function QueueTile({ room, highlighted }) {
  const current = room?.current;

  return (
    <section
      className={`sampi-tv-room-panel ${roomToneClass[room?.id] || roomToneClass.lor} ${
        highlighted ? "sampi-tv-room-pulse" : ""
      }`}
    >
      <div className="sampi-tv-room-head">
        <span>{room?.label || "LOR"}</span>
        <span>{current ? "Chaqirilgan" : "Kutilmoqda"}</span>
      </div>

      {current ? (
        <>
          <div className="sampi-tv-code">{current.queueCode}</div>
          <div className="sampi-tv-doctor">{current.doctorLabel}</div>
          <div className="sampi-tv-room-meta">
            <span>{formatTime(current.acceptedAt)}</span>
            <span>{formatWaiting(current.minutesSinceAccepted)}</span>
          </div>
        </>
      ) : (
        <div className="sampi-tv-empty-room">
          <span>--</span>
          <strong>Navbat yo'q</strong>
        </div>
      )}
    </section>
  );
}

function QueueRow({ item, index }) {
  return (
    <div className="sampi-tv-row">
      <span className="sampi-tv-row-number">{String(index + 1).padStart(2, "0")}</span>
      <span className="sampi-tv-row-code">{item.queueCode}</span>
      <span className="sampi-tv-row-room">{item.roomLabel}</span>
      <span className="sampi-tv-row-time">{formatTime(item.acceptedAt)}</span>
    </div>
  );
}

function TvLorQueuePage() {
  const [searchParams] = useSearchParams();
  const lorIdentity = useMemo(
    () => getSupportedLorIdentity(searchParams.get("lor") || searchParams.get("lorIdentity")),
    [searchParams]
  );
  const [queue, setQueue] = useState(null);
  const [clock, setClock] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pulseKey, setPulseKey] = useState("");
  const [kioskReady, setKioskReady] = useState(
    () => window.localStorage.getItem(KIOSK_READY_KEY) === "1"
  );
  const audioContextRef = useRef(null);
  const abortRef = useRef(null);
  const firstAnnouncementRef = useRef(true);
  const lastAnnouncementKeyRef = useRef("");
  const mountedRef = useRef(false);

  const visibleRooms = useMemo(() => queue?.rooms || [], [queue?.rooms]);
  const latestRows = useMemo(() => queue?.entries || [], [queue?.entries]);
  const currentKey = queue?.announcementKey || "";

  const ensureAudioContext = useCallback(async () => {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioContextRef.current) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtor();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playQueueTone = useCallback(async () => {
    if (!kioskReady) return;
    const context = await ensureAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
    gain.connect(context.destination);

    [659.25, 880, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.14);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.14);
      oscillator.stop(now + 0.92 + index * 0.08);
    });
  }, [ensureAudioContext, kioskReady]);

  const requestFullscreen = useCallback(async () => {
    const element = document.documentElement;
    if (document.fullscreenElement || !element?.requestFullscreen) return;
    await element.requestFullscreen();
  }, []);

  const enableKioskMode = useCallback(async () => {
    try {
      await ensureAudioContext();
    } catch {
      // Audio can stay muted if the browser blocks it.
    }

    try {
      await requestFullscreen();
    } catch {
      // Fullscreen also depends on browser kiosk policy.
    }

    window.localStorage.setItem(KIOSK_READY_KEY, "1");
    setKioskReady(true);
  }, [ensureAudioContext, requestFullscreen]);

  const loadQueue = useCallback(async ({ silent = false } = {}) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const data = await tvService.getLorQueue({ lorIdentity, limit: 18 }, controller.signal);
      setQueue(data);
      setError("");

      const nextAnnouncementKey = data?.announcementKey || "";
      if (
        nextAnnouncementKey &&
        nextAnnouncementKey !== lastAnnouncementKeyRef.current
      ) {
        if (!firstAnnouncementRef.current) {
          setPulseKey(nextAnnouncementKey);
          playQueueTone().catch(() => {});
          window.setTimeout(() => {
            if (mountedRef.current) setPulseKey("");
          }, 1900);
        }
        lastAnnouncementKeyRef.current = nextAnnouncementKey;
      }
      firstAnnouncementRef.current = false;
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        setError(extractErrorMessage(err));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
      setRefreshing(false);
    }
  }, [lorIdentity, playQueueTone]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timerId = 0;

    const run = async () => {
      await loadQueue({ silent: !firstAnnouncementRef.current });
      if (!stopped) {
        timerId = window.setTimeout(run, POLL_INTERVAL_MS);
      }
    };

    run();

    return () => {
      stopped = true;
      window.clearTimeout(timerId);
    };
  }, [loadQueue]);

  useEffect(() => {
    const timerId = window.setInterval(() => setClock(new Date()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadQueue({ silent: true });
      }
    };
    const onOnline = () => loadQueue({ silent: true });

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [loadQueue]);

  useEffect(() => {
    if (kioskReady) {
      requestFullscreen().catch(() => {});
      ensureAudioContext().catch(() => {});
    }
  }, [ensureAudioContext, kioskReady, requestFullscreen]);

  return (
    <main className={`sampi-tv-shell ${kioskReady ? "sampi-tv-kiosk-ready" : ""}`}>
      <div className="sampi-tv-stage">
        <header className="sampi-tv-topbar">
          <div>
            <div className="sampi-tv-brand">Sampi Medline</div>
            <h1>LOR navbat monitori</h1>
          </div>
          <div className="sampi-tv-live">
            <span className={error ? "sampi-tv-live-error" : ""} />
            <strong>{formatClock(clock)}</strong>
          </div>
        </header>

        <section className="sampi-tv-hero">
          <div>
            <p>Hozir chaqirilgan navbat</p>
            <strong>{queue?.current?.queueCode || "--"}</strong>
          </div>
          <div>
            <span>Smena</span>
            <b>
              {queue?.shift?.fromLabel || "08:00"} - {queue?.shift?.toLabel || "02:00"}
            </b>
          </div>
          <div>
            <span>Faol LOR navbat</span>
            <b>{queue?.totalActive ?? 0}</b>
          </div>
        </section>

        {loading ? (
          <section className="sampi-tv-loading">Navbat yuklanmoqda...</section>
        ) : (
          <>
            <section className="sampi-tv-room-grid">
              {visibleRooms.map((room) => (
                <QueueTile
                  key={room.id}
                  room={room}
                  highlighted={Boolean(currentKey && currentKey === pulseKey && room.current?.id === queue?.current?.id)}
                />
              ))}
            </section>

            <section className="sampi-tv-list-band">
              <div className="sampi-tv-list-head">
                <span>So'nggi chaqirilganlar</span>
                <span>
                  {refreshing ? "yangilanmoqda" : queue?.lastChangedAt ? formatTime(queue.lastChangedAt) : "--:--"}
                </span>
              </div>

              <div className="sampi-tv-list">
                {latestRows.length ? (
                  latestRows.map((item, index) => (
                    <QueueRow key={item.id} item={item} index={index} />
                  ))
                ) : (
                  <div className="sampi-tv-no-rows">Hozircha LOR navbati yo'q</div>
                )}
              </div>
            </section>
          </>
        )}

        {error ? <div className="sampi-tv-error">{error}</div> : null}
      </div>

      {!kioskReady ? (
        <button type="button" className="sampi-tv-kiosk-button" onClick={enableKioskMode}>
          TV rejimini yoqish
        </button>
      ) : null}
    </main>
  );
}

export default TvLorQueuePage;
