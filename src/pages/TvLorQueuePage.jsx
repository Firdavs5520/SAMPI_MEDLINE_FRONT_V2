import { useCallback, useEffect, useRef, useState } from "react";
import tvService from "../services/tvService.js";
import { extractErrorMessage } from "../utils/format.js";

const POLL_INTERVAL_MS = 4000;
const TV_MANIFEST_PATH = "/manifest-tv.webmanifest?v=1";

function TvLorQueuePage() {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulseKey, setPulseKey] = useState("");
  const audioContextRef = useRef(null);
  const abortRef = useRef(null);
  const firstAnnouncementRef = useRef(true);
  const lastAnnouncementKeyRef = useRef("");
  const mountedRef = useRef(false);

  const current = queue?.current || null;
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

  const loadQueue = useCallback(async ({ silent = false } = {}) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) {
      setLoading(true);
    }

    try {
      const data = await tvService.getLorQueue({ lorIdentity: "lor1", limit: 1 }, controller.signal);
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
    }
  }, [playQueueTone]);

  useEffect(() => {
    mountedRef.current = true;

    const manifestLink = document.querySelector("link[rel='manifest']");
    const previousManifest = manifestLink?.getAttribute("href") || "";
    if (manifestLink) {
      manifestLink.setAttribute("href", TV_MANIFEST_PATH);
    }

    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      if (manifestLink && previousManifest) {
        manifestLink.setAttribute("href", previousManifest);
      }
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

  return (
    <main className="sampi-tv-shell sampi-tv-minimal-shell sampi-tv-kiosk-ready">
      <div className="sampi-tv-minimal-stage">
        <section
          className={`sampi-tv-current-card ${
            currentKey && currentKey === pulseKey ? "sampi-tv-current-pulse" : ""
          } ${error ? "sampi-tv-current-muted" : ""}`}
        >
          {loading ? (
            <div className="sampi-tv-current-empty">Yuklanmoqda</div>
          ) : current ? (
            <>
              <div className="sampi-tv-current-kicker">Hozirgi bemor</div>
              <div className="sampi-tv-current-code">{current.queueCode}</div>
              <div className="sampi-tv-current-divider" />
              <div className="sampi-tv-current-doctor">{current.doctorLabel}</div>
            </>
          ) : (
            <div className="sampi-tv-current-empty">Navbat yo'q</div>
          )}
        </section>
      </div>
    </main>
  );
}

export default TvLorQueuePage;
