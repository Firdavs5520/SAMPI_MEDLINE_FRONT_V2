import { useCallback, useEffect, useRef, useState } from "react";
import tvService from "../services/tvService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage } from "../utils/format.js";

const POLL_INTERVAL_MS = 4000;
const STREAM_RECONNECT_MS = 2500;
const TV_MANIFEST_PATH = "/manifest-tv.webmanifest?v=7";
const WAITING_TICKET_LIMIT = 80;
const ADMIN_EXIT_PRESS_COUNT = 5;
const ADMIN_EXIT_WINDOW_MS = 4500;
const QUEUE_CHIME_PATH = "/audio/premium_queue_chime_close_match.wav";
// O'zbekcha ovozli chaqiruv: public/audio/queue/15.mp3 -> "O'n beshinchi raqam, navbatingiz keldi."
// Fayllar scripts/generate-queue-voice.mjs bilan yaratiladi.
// ?v= ovoz qayta yaratilganda oshiriladi: service worker keshidagi eski fayl chalinmasin.
const QUEUE_VOICE_VERSION = 2;
const QUEUE_VOICE_PATH = (number) => `/audio/queue/${number}.mp3?v=${QUEUE_VOICE_VERSION}`;
const QUEUE_VOICE_MAX = 150;
const CHIME_MAX_WAIT_MS = 4000;
const VOICE_LOAD_TIMEOUT_MS = 5000;
// Chaqirilgan raqam katta ekranda 8 soniya turadi (pastdagi chiziq qolgan vaqtni ko'rsatadi).
const CALL_ANNOUNCEMENT_MS = 8000;
// Oqim (SSE) ulangan ko'rinsa ham proksi xabarni kechiktirishi yoki jim uzilishi mumkin,
// shuning uchun navbat har doim shu oraliqda serverdan qayta so'raladi.
const LIVE_POLL_INTERVAL_MS = 3000;

// TV yozuvlari har 10 soniyada o'zbekcha va ruscha almashadi.
const TV_LANGUAGE_SWITCH_MS = 10000;
const TV_TEXT = {
  uz: {
    callKicker: "Navbatingiz keldi",
    callNote: "LOR xonasiga kiring",
    waitTitle: "Navbatingizni kuting",
    waitSub: "Raqamingiz shu yerda chaqiriladi",
    countSuffix: "ta",
    currentKicker: "Hozir qabulda",
    currentNote: "LOR xonasida",
    callingKicker: "Chaqirilmoqda",
    callingNote: "LOR xonasiga kiring",
    waitingTitle: "Navbatdagilar",
    loading: "Yuklanmoqda",
    next: "Keyingi",
    empty: "Hozirda navbat yo'q",
    reconnect: "Aloqa tiklanmoqda. Oxirgi raqam ekranda saqlanadi."
  },
  ru: {
    callKicker: "Ваша очередь",
    callNote: "Пройдите в кабинет ЛОР",
    waitTitle: "Ожидайте своей очереди",
    waitSub: "Ваш номер появится здесь",
    countSuffix: "чел.",
    currentKicker: "Сейчас на приёме",
    currentNote: "В кабинете ЛОР",
    callingKicker: "Вызывается",
    callingNote: "Пройдите в кабинет ЛОР",
    waitingTitle: "Очередь",
    loading: "Загрузка",
    next: "Следующий",
    empty: "Сейчас очереди нет",
    reconnect: "Восстанавливаем связь. Последний номер остаётся на экране."
  }
};

// Til almashganda matn silliq paydo bo'ladi (key o'zgarishi animatsiyani qayta boshlaydi).
const TvText = ({ lang, children }) => (
  <span key={lang} className="sampi-tv-lang-swap">
    {children}
  </span>
);

const formatTvQueueCode = (value) => {
  const digits = String(value ?? "").match(/\d+/g)?.join("") || "";
  if (!digits) return "--";

  const number = Number(digits);
  if (!Number.isFinite(number)) return digits;
  if (number < 100) return String(number).padStart(2, "0");
  return String(number);
};

// "Keyingi"dan keyingi raqamlar soniga qarab katakchalar soni va o'lchami.
const getRestDensity = (count) => {
  if (count > 24) return { columns: 4, className: "tvx-rest-ultra" };
  if (count > 12) return { columns: 3, className: "tvx-rest-dense" };
  if (count > 4) return { columns: 2, className: "" };
  return { columns: 2, className: "tvx-rest-large" };
};

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"
];
const UZ_WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

// Toshkent vaqti (TV qurilmasining vaqt mintaqasidan qat'i nazar).
const getTashkentParts = (now) => {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return {
    hours: String(local.getUTCHours()).padStart(2, "0"),
    minutes: String(local.getUTCMinutes()).padStart(2, "0"),
    day: local.getUTCDate(),
    month: local.getUTCMonth(),
    weekday: local.getUTCDay(),
    year: local.getUTCFullYear()
  };
};

const formatTvDate = (parts, lang) => {
  if (lang === "ru") {
    const date = new Date(Date.UTC(parts.year, parts.month, parts.day, 12));
    const text = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      weekday: "long",
      timeZone: "UTC"
    }).format(date);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${parts.day}-${UZ_MONTHS[parts.month]}, ${UZ_WEEKDAYS[parts.weekday]}`;
};

// Katta soat: har 10 soniyada yangilanadi (daqiqa aniqligi yetarli).
function TvClock({ lang, compact = false }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const parts = getTashkentParts(now);
  return (
    <div className={`tvx-clock ${compact ? "tvx-clock-compact" : ""}`}>
      <div className="tvx-clock-time">
        {parts.hours}
        <span className="tvx-clock-colon">:</span>
        {parts.minutes}
      </div>
      {compact ? null : (
        <div className="tvx-clock-date">
          <TvText lang={lang}>{formatTvDate(parts, lang)}</TvText>
        </div>
      )}
    </div>
  );
}

function TvLorQueuePage() {
  const { logout } = useAuth();
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulseKey, setPulseKey] = useState("");
  const [callAnnouncement, setCallAnnouncement] = useState(null);
  const [audioStatus, setAudioStatus] = useState("needs-interaction");
  const [connectionState, setConnectionState] = useState("connecting");
  const [tvLang, setTvLang] = useState("uz");
  const t = TV_TEXT[tvLang];
  const audioContextRef = useRef(null);
  const queueChimeRef = useRef(null);
  const queueVoiceRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const abortRef = useRef(null);
  const eventSourceRef = useRef(null);
  const fallbackTimerRef = useRef(0);
  const callAnnouncementTimerRef = useRef(0);
  const reconnectTimerRef = useRef(0);
  const streamAttemptRef = useRef(0);
  const firstAnnouncementRef = useRef(true);
  const lastAnnouncementKeyRef = useRef("");
  const announcedKeysRef = useRef(new Set());
  const lastGeneratedAtRef = useRef(0);
  const mountedRef = useRef(false);
  const connectionStateRef = useRef("connecting");
  const adminExitRef = useRef({ count: 0, timer: 0 });

  const current = queue?.current || null;
  const displayQueueCode = current ? formatTvQueueCode(current.queueCode) : "";
  const waitingTickets = Array.isArray(queue?.waiting) ? queue.waiting : [];
  const waitingTicketCount = waitingTickets.length;
  const nextTicket = waitingTickets[0] || null;
  const restTickets = waitingTickets.slice(1);
  const restDensity = getRestDensity(restTickets.length);
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
    if (!context) return false;

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
    return true;
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
        audioUnlockedRef.current = true;
        setAudioStatus("ready");
        // Ovozli e'lon "ding" tugagandan keyin boshlanishi uchun.
        await new Promise((resolve) => {
          const timer = window.setTimeout(resolve, CHIME_MAX_WAIT_MS);
          audio.onended = () => {
            window.clearTimeout(timer);
            resolve();
          };
        });
        return;
      } catch {
        // Browser autoplay rules may block the file; keep the TV cue alive with Web Audio.
      }
    }

    try {
      const playedFallback = await playSyntheticQueueTone();
      if (playedFallback) {
        audioUnlockedRef.current = true;
        setAudioStatus("ready");
        return;
      }
    } catch {
      // Keep the user-facing state below; most TV browsers need one touch/click first.
    }

    setAudioStatus("blocked");
  }, [ensureQueueChime, playSyntheticQueueTone]);

  // Ovoz fayli Web Audio orqali chalinadi: fayl yuklanib, xotirada dekodlanadi va AudioContext'da
  // ijro etiladi. <audio> elementidagi avtoplay va service worker keshi muammolari bunga ta'sir
  // qilmaydi. Dekodlangan ovozlar xotirada saqlanadi, navbatdagilari oldindan tayyorlanadi.
  const voiceBuffersRef = useRef(new Map());
  const voiceSourceRef = useRef(null);

  const loadVoiceBuffer = useCallback(
    (path) => {
      const cached = voiceBuffersRef.current.get(path);
      if (cached) return cached;
      const promise = (async () => {
        // Dekodlash uchun AudioContext'ni yoqish (resume) shart emas.
        if (!audioContextRef.current) {
          const AudioCtor = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtor) throw new Error("Web Audio yo'q");
          audioContextRef.current = new AudioCtor();
        }
        const context = audioContextRef.current;
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Ovoz fayli yuklanmadi: ${response.status}`);
        const data = await response.arrayBuffer();
        return context.decodeAudioData(data);
      })();
      voiceBuffersRef.current.set(path, promise);
      promise.catch(() => voiceBuffersRef.current.delete(path));
      return promise;
    },
    []
  );

  const playVoiceWithAudioElement = useCallback(async (path) => {
    queueVoiceRef.current?.pause();
    const voice = new Audio(path);
    voice.volume = 1;
    queueVoiceRef.current = voice;
    await voice.play();
  }, []);

  // Raqamni o'zbekcha ovoz bilan bir marta aytadi; yangi chaqiruv kelsa eskisi to'xtaydi.
  const speakQueueNumber = useCallback(
    async (code) => {
      const number = Number(String(code ?? "").replace(/\D/g, ""));
      if (!number || number > QUEUE_VOICE_MAX) return;
      const path = QUEUE_VOICE_PATH(number);

      try {
        const buffer = await Promise.race([
          loadVoiceBuffer(path),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), VOICE_LOAD_TIMEOUT_MS))
        ]);
        const context = audioContextRef.current;
        if (context?.state === "suspended") {
          await Promise.race([context.resume(), new Promise((resolve) => window.setTimeout(resolve, 800))]);
        }
        if (!context || context.state !== "running") throw new Error("AudioContext ishlamayapti");
        try {
          voiceSourceRef.current?.stop();
        } catch {
          // Oldingi ovoz allaqachon tugagan.
        }
        queueVoiceRef.current?.pause();
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(context.destination);
        voiceSourceRef.current = source;
        source.start();
        return;
      } catch {
        // Web Audio ishlamasa oddiy audio element bilan urinib ko'riladi.
      }

      await playVoiceWithAudioElement(path).catch(() => {});
    },
    [loadVoiceBuffer, playVoiceWithAudioElement]
  );

  // Navbatdagi raqamlarning ovozlari oldindan yuklanib dekodlanadi: chaqiruvda kutilmaydi.
  const prefetchQueueVoices = useCallback(
    (tickets) => {
      (tickets || []).slice(0, 3).forEach((ticket) => {
        const number = Number(String(ticket?.queueCode ?? "").replace(/\D/g, ""));
        if (!number || number > QUEUE_VOICE_MAX) return;
        loadVoiceBuffer(QUEUE_VOICE_PATH(number)).catch(() => {});
      });
    },
    [loadVoiceBuffer]
  );

  const unlockQueueAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    playQueueTone().catch(() => {
      setAudioStatus("blocked");
    });
  }, [playQueueTone]);

  const applyQueueData = useCallback(
    (data) => {
      // Oqim va so'rov javoblari aralash keladi: eskiroq ma'lumot yangisini bosib ketmasin.
      const generatedAt = Date.parse(data?.generatedAt || "") || 0;
      if (generatedAt && generatedAt < lastGeneratedAtRef.current) return;
      if (generatedAt) lastGeneratedAtRef.current = generatedAt;

      setQueue(data);
      setError("");
      setLoading(false);
      prefetchQueueVoices(data?.waiting);

      const nextAnnouncementKey = data?.announcementKey || "";
      const nextAnnouncementCode = data?.current
        ? formatTvQueueCode(data.current.queueCode)
        : "";
      if (
        nextAnnouncementKey &&
        nextAnnouncementCode &&
        nextAnnouncementKey !== lastAnnouncementKeyRef.current
      ) {
        // Har bir chaqiruv (qayta chaqiruv ham yangi kalit oladi) faqat bir marta e'lon qilinadi.
        const alreadyAnnounced = announcedKeysRef.current.has(nextAnnouncementKey);
        announcedKeysRef.current.add(nextAnnouncementKey);
        if (!firstAnnouncementRef.current && !alreadyAnnounced) {
          setPulseKey(nextAnnouncementKey);
          window.clearTimeout(callAnnouncementTimerRef.current);
          setCallAnnouncement({
            key: nextAnnouncementKey,
            code: nextAnnouncementCode
          });
          playQueueTone()
            .then(() => speakQueueNumber(nextAnnouncementCode))
            .catch(() => {});
          window.setTimeout(() => {
            if (mountedRef.current) setPulseKey("");
          }, 1900);
          callAnnouncementTimerRef.current = window.setTimeout(() => {
            if (mountedRef.current) setCallAnnouncement(null);
          }, CALL_ANNOUNCEMENT_MS);
        }
        lastAnnouncementKeyRef.current = nextAnnouncementKey;
      }
      firstAnnouncementRef.current = false;
    },
    [playQueueTone, prefetchQueueVoices, speakQueueNumber]
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
    const attemptId = streamAttemptRef.current + 1;
    streamAttemptRef.current = attemptId;

    tvService.openLorQueueStream({
      lorIdentity: "lor1",
      limit: WAITING_TICKET_LIMIT
    })
      .then((source) => {
        if (!mountedRef.current || streamAttemptRef.current !== attemptId) {
          source.close();
          return;
        }

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
      })
      .catch((err) => {
        if (!mountedRef.current || streamAttemptRef.current !== attemptId) return;
        setError(extractErrorMessage(err));
        setConnectionState("reconnecting");
        loadQueue({ silent: true });
        reconnectTimerRef.current = window.setTimeout(connectStream, STREAM_RECONNECT_MS);
      });
  }, [applyQueueData, closeEventSource, loadQueue]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setTvLang((current) => (current === "uz" ? "ru" : "uz")),
      TV_LANGUAGE_SWITCH_MS
    );
    return () => window.clearInterval(timer);
  }, []);

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
      window.clearTimeout(callAnnouncementTimerRef.current);
      window.clearTimeout(reconnectTimerRef.current);
      streamAttemptRef.current += 1;
      closeEventSource();
      if (queueChimeRef.current) {
        queueChimeRef.current.pause();
        queueChimeRef.current = null;
      }
      queueVoiceRef.current?.pause();
      queueVoiceRef.current = null;
      if (abortRef.current) abortRef.current.abort();
      if (manifestLink && previousManifest) {
        manifestLink.setAttribute("href", previousManifest);
      }
    };
  }, [closeEventSource, connectStream, ensureQueueChime]);

  // TV ilovasi (Android WebView) yoki kiosk brauzer avtomatik ovozga ruxsat bersa,
  // AudioContext darhol "running" bo'ladi: tugma ko'rsatilmaydi, ovoz o'zi chalinadi.
  useEffect(() => {
    let cancelled = false;
    ensureAudioContext()
      .then((context) => {
        if (cancelled || !context || context.state !== "running") return;
        audioUnlockedRef.current = true;
        setAudioStatus("ready");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ensureAudioContext]);

  useEffect(() => {
    const onAudioKeyDown = (event) => {
      if (audioUnlockedRef.current) return;
      if (event.key === "Enter" || event.key === " ") {
        unlockQueueAudio();
      }
    };

    window.addEventListener("keydown", onAudioKeyDown);

    return () => {
      window.removeEventListener("keydown", onAudioKeyDown);
    };
  }, [unlockQueueAudio]);

  useEffect(() => {
    let stopped = false;

    const run = async () => {
      const isLive = connectionStateRef.current === "live";
      await loadQueue({ silent: !firstAnnouncementRef.current });

      if (!stopped) {
        fallbackTimerRef.current = window.setTimeout(
          run,
          isLive ? LIVE_POLL_INTERVAL_MS : POLL_INTERVAL_MS
        );
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
    <main className="tvx-shell sampi-tv-kiosk-ready">
      <header className="tvx-head">
        <h1 className="tvx-brand" aria-label="SAMPI MEDICINE">
          <span>SAMPI</span> <strong>MEDICINE</strong>
        </h1>
        <TvClock lang={tvLang} />
      </header>

      <div className="tvx-grid">
        <section
          className={`tvx-card tvx-current ${isConnectionSoft ? "tvx-muted" : ""}`}
          aria-live="polite"
        >
          {current ? (
            <div
              key={currentKey || current.id}
              className={`tvx-current-body ${current.arrived === false ? "tvx-calling" : ""} ${
                currentKey && currentKey === pulseKey ? "tvx-pulse" : ""
              }`}
            >
              {/* Chaqirilgan, lekin hali kirmagan bemor "qabulda" deb ko'rsatilmaydi. */}
              <div className="tvx-kicker">
                <TvText lang={tvLang}>{current.arrived === false ? t.callingKicker : t.currentKicker}</TvText>
              </div>
              <div className="tvx-current-number">{displayQueueCode}</div>
              <div className="tvx-current-note">
                <TvText lang={tvLang}>{current.arrived === false ? t.callingNote : t.currentNote}</TvText>
              </div>
            </div>
          ) : (
            <div className="tvx-standby">
              <svg className="tvx-standby-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <div className="tvx-standby-title">
                <TvText lang={tvLang}>{loading ? t.loading : t.waitTitle}</TvText>
              </div>
              <div className="tvx-standby-sub">
                <TvText lang={tvLang}>{t.waitSub}</TvText>
              </div>
            </div>
          )}
        </section>

        <aside className="tvx-card tvx-waiting" aria-label="Navbatdagilar">
          <div className="tvx-waiting-head">
            <span>
              <TvText lang={tvLang}>{t.waitingTitle}</TvText>
            </span>
            <b>{loading && !queue ? "..." : `${waitingTicketCount} ${t.countSuffix}`}</b>
          </div>

          {waitingTicketCount ? (
            <>
              <div className="tvx-next" key={nextTicket.id || nextTicket.queueCode}>
                <span className="tvx-next-number">{formatTvQueueCode(nextTicket.queueCode)}</span>
                <span className="tvx-next-pill">
                  <TvText lang={tvLang}>{t.next}</TvText>
                </span>
              </div>
              {restTickets.length ? (
                <div
                  className={`tvx-rest ${restDensity.className}`}
                  style={{ gridTemplateColumns: `repeat(${restDensity.columns}, minmax(0, 1fr))` }}
                >
                  {restTickets.map((ticket, index) => (
                    <div
                      className="tvx-rest-cell"
                      style={{ "--row-delay": `${Math.min(index, 12) * 35}ms` }}
                      key={ticket.id || ticket._id || ticket.queueCode}
                    >
                      {formatTvQueueCode(ticket.queueCode)}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="tvx-waiting-empty">
              <TvText lang={tvLang}>{loading && !queue ? t.loading : t.empty}</TvText>
            </div>
          )}
        </aside>
      </div>

      {callAnnouncement ? (
        <div className="tvx-call" aria-live="assertive" aria-atomic="true" key={callAnnouncement.key}>
          <div className="tvx-call-clock">
            <TvClock lang={tvLang} compact />
          </div>
          <div className="tvx-call-kicker">
            <TvText lang={tvLang}>{t.callKicker}</TvText>
          </div>
          <div className="tvx-call-number">{callAnnouncement.code}</div>
          <div className="tvx-call-note">
            <TvText lang={tvLang}>{t.callNote}</TvText>
          </div>
          <div
            className="tvx-call-progress"
            style={{ "--call-ms": `${CALL_ANNOUNCEMENT_MS}ms` }}
            aria-hidden="true"
          />
        </div>
      ) : null}

      {audioStatus !== "ready" ? (
        <button className="tvx-audio" type="button" onClick={unlockQueueAudio}>
          Ovozni yoqish
        </button>
      ) : null}

      {isConnectionSoft ? <div className="tvx-reconnect">{t.reconnect}</div> : null}
    </main>
  );
}

export default TvLorQueuePage;
