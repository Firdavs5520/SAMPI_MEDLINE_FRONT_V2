import { useCallback, useEffect, useRef, useState } from "react";
import tvService from "../services/tvService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage } from "../utils/format.js";

const POLL_INTERVAL_MS = 4000;
const STREAM_RECONNECT_MS = 2500;
const TV_MANIFEST_PATH = "/manifest-tv.webmanifest?v=2";
const WAITING_TICKET_LIMIT = 6;
const ADMIN_EXIT_PRESS_COUNT = 5;
const ADMIN_EXIT_WINDOW_MS = 4500;
const QUEUE_CHIME_PATH = "/audio/premium_queue_chime_close_match.wav";

const formatTvQueueCode = (value) => {
  const digits = String(value ?? "").match(/\d+/g)?.join("") || "";
  if (!digits) return "--";

  const number = Number(digits);
  if (!Number.isFinite(number)) return digits;
  if (number < 100) return String(number).padStart(2, "0");
  return String(number);
};

function TvLorQueuePage() {
  const { logout } = useAuth();
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulseKey, setPulseKey] = useState("");
  const [connectionState, setConnectionState] = useState("connecting");
  const audioContextRef = useRef(null);
  const queueChimeRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const abortRef = useRef(null);
  const eventSourceRef = useRef(null);
  const fallbackTimerRef = useRef(0);
  const reconnectTimerRef = useRef(0);
  const firstAnnouncementRef = useRef(true);
  const lastAnnouncementKeyRef = useRef("");
  const mountedRef = useRef(false);
  const connectionStateRef = useRef("connecting");
  const adminExitRef = useRef({ count: 0, timer: 0 });

  const current = queue?.current || null;
  const displayQueueCode = current ? formatTvQueueCode(current.queueCode) : "";
  const waitingTickets = Array.isArray(queue?.waiting)
    ? queue.waiting.slice(0, WAITING_TICKET_LIMIT)
    : [];
  const currentKey = queue?.announcementKey || "";
  const isConnectionSoft =
    connectionState === "reconnecting" || connectionState === "polling" || Boolean(error);

  const logoutTvSession = useCallback(() => {
    logout();
    window.location.replace("/login");
  }, [logout]);

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

  const ensureQueueChime = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!queueChimeRef.current) {
      const audio = new Audio(QUEUE_CHIME_PATH);
      audio.preload = "auto";
      audio.volume = 0.9;
      queueChimeRef.current = audio;
    }
    return queueChimeRef.current;
  }, []);

  const playSyntheticQueueTone = useCallback(async () => {
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
  }, [ensureAudioContext]);

  const playQueueTone = useCallback(async () => {
    const audio = ensureQueueChime();
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 0.9;
        await audio.play();
        return;
      } catch {
        // Browser autoplay rules may block the file; keep the TV cue alive with Web Audio.
      }
    }

    await playSyntheticQueueTone();
  }, [ensureQueueChime, playSyntheticQueueTone]);

  const unlockQueueAudio = useCallback(() => {
    const audio = ensureQueueChime();
    if (!audio || audioUnlockedRef.current) return;

    const previousVolume = audio.volume;
    audio.muted = true;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = previousVolume;
        audioUnlockedRef.current = true;
      })
      .catch(() => {
        audio.muted = false;
        audio.volume = previousVolume;
      });
    ensureAudioContext().catch(() => {});
  }, [ensureAudioContext, ensureQueueChime]);

  const applyQueueData = useCallback(
    (data) => {
      setQueue(data);
      setError("");
      setLoading(false);

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
    },
    [playQueueTone]
  );

  const loadQueue = useCallback(
    async ({ silent = false } = {}) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) {
        setLoading(true);
      }

      try {
        const data = await tvService.getLorQueue(
          { lorIdentity: "lor1", limit: WAITING_TICKET_LIMIT },
          controller.signal
        );
        applyQueueData(data);
        if (connectionStateRef.current !== "live") {
          setConnectionState("polling");
        }
      } catch (err) {
        if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
          setError(extractErrorMessage(err));
          if (connectionStateRef.current !== "live") {
            setConnectionState("reconnecting");
          }
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setLoading(false);
      }
    },
    [applyQueueData]
  );

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connectStream = useCallback(() => {
    if (!window.EventSource) {
      setConnectionState("polling");
      loadQueue({ silent: true });
      return;
    }

    window.clearTimeout(reconnectTimerRef.current);
    closeEventSource();
    setConnectionState("connecting");

    const source = tvService.openLorQueueStream({
      lorIdentity: "lor1",
      limit: WAITING_TICKET_LIMIT
    });
    eventSourceRef.current = source;

    const handleStreamData = (event) => {
      try {
        const data = JSON.parse(event.data);
        setConnectionState("live");
        applyQueueData(data);
      } catch {
        setError("TV navbat ma'lumoti noto'g'ri keldi.");
      }
    };

    source.onopen = () => {
      if (mountedRef.current) {
        setConnectionState("live");
      }
    };
    source.addEventListener("snapshot", handleStreamData);
    source.addEventListener("queue", handleStreamData);
    source.addEventListener("stream-error", (event) => {
      try {
        const data = JSON.parse(event.data);
        setError(data?.message || "TV navbat stream xatosi.");
      } catch {
        setError("TV navbat stream xatosi.");
      }
    });
    source.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionState("reconnecting");
      closeEventSource();
      loadQueue({ silent: true });
      reconnectTimerRef.current = window.setTimeout(connectStream, STREAM_RECONNECT_MS);
    };
  }, [applyQueueData, closeEventSource, loadQueue]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldLogout =
      params.get("logout") === "1" || params.get("exit") === "1";

    if (shouldLogout) {
      logoutTvSession();
    }
  }, [logoutTvSession]);

  useEffect(() => {
    const resetAdminExit = () => {
      window.clearTimeout(adminExitRef.current.timer);
      adminExitRef.current = { count: 0, timer: 0 };
    };

    const onKeyDown = (event) => {
      const isExitKey = event.key === "0" || event.key === "Escape";
      if (!isExitKey) {
        resetAdminExit();
        return;
      }

      window.clearTimeout(adminExitRef.current.timer);
      const nextCount = adminExitRef.current.count + 1;

      if (nextCount >= ADMIN_EXIT_PRESS_COUNT) {
        resetAdminExit();
        logoutTvSession();
        return;
      }

      adminExitRef.current = {
        count: nextCount,
        timer: window.setTimeout(resetAdminExit, ADMIN_EXIT_WINDOW_MS)
      };
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      resetAdminExit();
    };
  }, [logoutTvSession]);

  useEffect(() => {
    mountedRef.current = true;
    document.documentElement.classList.add("sampi-tv-lock");
    document.body.classList.add("sampi-tv-lock");
    ensureQueueChime()?.load();

    const manifestLink = document.querySelector("link[rel='manifest']");
    const previousManifest = manifestLink?.getAttribute("href") || "";
    if (manifestLink) {
      manifestLink.setAttribute("href", TV_MANIFEST_PATH);
    }

    connectStream();

    return () => {
      mountedRef.current = false;
      document.documentElement.classList.remove("sampi-tv-lock");
      document.body.classList.remove("sampi-tv-lock");
      window.clearTimeout(fallbackTimerRef.current);
      window.clearTimeout(reconnectTimerRef.current);
      closeEventSource();
      if (queueChimeRef.current) {
        queueChimeRef.current.pause();
        queueChimeRef.current = null;
      }
      if (abortRef.current) abortRef.current.abort();
      if (manifestLink && previousManifest) {
        manifestLink.setAttribute("href", previousManifest);
      }
    };
  }, [closeEventSource, connectStream, ensureQueueChime]);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockQueueAudio, { passive: true });
    window.addEventListener("touchstart", unlockQueueAudio, { passive: true });
    window.addEventListener("keydown", unlockQueueAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockQueueAudio);
      window.removeEventListener("touchstart", unlockQueueAudio);
      window.removeEventListener("keydown", unlockQueueAudio);
    };
  }, [unlockQueueAudio]);

  useEffect(() => {
    let stopped = false;

    const run = async () => {
      if (connectionStateRef.current !== "live") {
        await loadQueue({ silent: !firstAnnouncementRef.current });
      }

      if (!stopped) {
        fallbackTimerRef.current = window.setTimeout(run, POLL_INTERVAL_MS);
      }
    };

    run();

    return () => {
      stopped = true;
      window.clearTimeout(fallbackTimerRef.current);
    };
  }, [loadQueue]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (connectionStateRef.current !== "live") {
          connectStream();
        }
        loadQueue({ silent: true });
      }
    };
    const onOnline = () => {
      connectStream();
      loadQueue({ silent: true });
    };
    const onOffline = () => {
      setConnectionState("reconnecting");
      setError("Internet aloqasi uzildi. Oxirgi raqam ekranda qoldi.");
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [connectStream, loadQueue]);

  return (
    <main className="sampi-tv-shell sampi-tv-minimal-shell sampi-tv-kiosk-ready">
      <div className="sampi-tv-minimal-stage">
        <h1 className="sampi-tv-clinic-brand" aria-label="SAMPI MEDICINE">
          <span>SAMPI</span>
          <strong>MEDICINE</strong>
        </h1>

        <div className="sampi-tv-screen-grid">
          <section
            className={`sampi-tv-current-card ${
              currentKey && currentKey === pulseKey ? "sampi-tv-current-pulse" : ""
            } ${isConnectionSoft ? "sampi-tv-current-muted" : ""}`}
          >
            {loading && !current ? (
              <div className="sampi-tv-standby" aria-live="polite">
                <div className="sampi-tv-standby-kicker">LOR</div>
                <div className="sampi-tv-standby-title">Raqamingizni kuting</div>
                <div className="sampi-tv-standby-line" aria-hidden="true" />
              </div>
            ) : current ? (
              <div className="sampi-tv-current-content" aria-live="polite">
                <div className="sampi-tv-number-shell">
                  <div className="sampi-tv-current-code">{displayQueueCode}</div>
                </div>
                <div className="sampi-tv-current-note">
                  Bu raqam LOR xonasida davolanmoqda
                </div>
              </div>
            ) : (
              <div className="sampi-tv-standby" aria-live="polite">
                <div className="sampi-tv-standby-kicker">LOR</div>
                <div className="sampi-tv-standby-title">Raqamingizni kuting</div>
                <div className="sampi-tv-standby-line" aria-hidden="true" />
              </div>
            )}
          </section>

          <aside
            className={`sampi-tv-waiting-menu ${
              waitingTickets.length ? "sampi-tv-waiting-menu-active" : "sampi-tv-waiting-menu-empty"
            }`}
            aria-label="Kassadan chiqarilgan LOR cheklari"
          >
            <div className="sampi-tv-waiting-head">
              <div>
                <span>Navbatdagilar</span>
                <strong>Kassa bergan LOR raqamlari</strong>
              </div>
              <b>{loading && !queue ? "..." : waitingTickets.length}</b>
            </div>
            <div className="sampi-tv-waiting-list">
              {loading && !queue ? (
                <div className="sampi-tv-waiting-empty">Yuklanmoqda</div>
              ) : waitingTickets.length ? (
                waitingTickets.map((ticket, index) => (
                  <div
                    className={`sampi-tv-waiting-row ${
                      index === 0 ? "sampi-tv-waiting-row-next" : ""
                    }`}
                    style={{ "--row-delay": `${260 + index * 70}ms` }}
                    key={ticket.id || ticket._id || ticket.queueCode}
                  >
                    <span>{formatTvQueueCode(ticket.queueCode)}</span>
                    {index === 0 ? <small>Keyingi</small> : null}
                  </div>
                ))
              ) : (
                <div className="sampi-tv-waiting-empty">
                  Yangi chek chiqsa shu yerda ko'rinadi
                </div>
              )}
            </div>
          </aside>
        </div>

        {isConnectionSoft ? (
          <div className="sampi-tv-reconnect-note">
            {error || "Aloqa tiklanmoqda. Oxirgi raqam ekranda saqlanadi."}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default TvLorQueuePage;
