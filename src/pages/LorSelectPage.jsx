import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import Spinner from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import usageService from "../services/usageService.js";
import { extractErrorMessage } from "../utils/format.js";

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

const getDoctorInitials = (value) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "DR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
};

// Har bir doktorga ismidan kelib chiqqan doimiy rang (har safar bir xil).
const AVATAR_TONES = ["teal", "sky", "violet", "amber", "rose", "emerald"];
const getAvatarTone = (value) => {
  let hash = 0;
  for (const char of String(value || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
};

// Pro doktorlar o'rtada: oddiylarning yarmi chapda, pro'lar markazda, qolgani o'ngda.
const arrangeProInMiddle = (list) => {
  const pro = list.filter((item) => item?.pro);
  if (!pro.length) return list;
  const regular = list.filter((item) => !item?.pro);
  const leftCount = Math.ceil(regular.length / 2);
  return [...regular.slice(0, leftCount), ...pro, ...regular.slice(leftCount)];
};

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const getTashkentTime = (now) => {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return { hours: local.getUTCHours(), minutes: local.getUTCMinutes() };
};

const getGreeting = (hours) => {
  if (hours >= 5 && hours < 12) return "Xayrli tong";
  if (hours >= 12 && hours < 18) return "Xayrli kun";
  return "Xayrli kech";
};

// Tanlangan guvohnoma "Smena boshlandi" muhri bilan ko'rinib turadi, keyin sahifa ochiladi.
const DOCTOR_CONFIRM_DELAY_MS = 950;
const ACTIVE_LOR_IDENTITY = "lor1";
const MAX_SHORTCUT = 9;

function LorSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lorIdentity, lorDoctor, setLorIdentity, setLorDoctor } = useAuth();

  const [specialists, setSpecialists] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [confirmingDoctorId, setConfirmingDoctorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const doctorTimerRef = useRef(null);

  const returnPath = location.state?.from?.pathname || "/lor/services";
  const time = getTashkentTime(now);
  const clock = `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;

  const filteredSpecialists = useMemo(() => {
    const query = normalizeSearch(doctorSearch);
    const list = query
      ? specialists.filter((item) => normalizeSearch(item?.name).includes(query))
      : specialists;
    return arrangeProInMiddle(list);
  }, [doctorSearch, specialists]);

  useEffect(() => {
    const loadSpecialists = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await usageService.getRoleSpecialists();
        setSpecialists(data);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    loadSpecialists();
  }, []);

  useEffect(() => {
    if (lorIdentity !== ACTIVE_LOR_IDENTITY) {
      setLorIdentity(ACTIVE_LOR_IDENTITY);
    }
  }, [lorIdentity, setLorIdentity]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (doctorTimerRef.current) {
        window.clearTimeout(doctorTimerRef.current);
      }
    },
    []
  );

  const chooseDoctor = useCallback(
    (doctor) => {
      if (confirmingDoctorId) return;
      const doctorId = doctor?._id;
      if (!doctorId) return;

      setConfirmingDoctorId(doctorId);
      doctorTimerRef.current = window.setTimeout(() => {
        setLorDoctor({ id: doctorId, name: doctor?.name });
        setConfirmingDoctorId("");
        doctorTimerRef.current = null;
        navigate(returnPath, { replace: true });
      }, DOCTOR_CONFIRM_DELAY_MS);
    },
    [confirmingDoctorId, navigate, returnPath, setLorDoctor]
  );

  // Tab o'chirilgan: guvohnoma ustidagi raqam tugmasi (1-9) bilan ham tanlanadi.
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = String(event.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || event.ctrlKey || event.altKey || event.metaKey) return;
      const number = Number(event.key);
      if (!Number.isInteger(number) || number < 1 || number > MAX_SHORTCUT) return;
      const doctor = filteredSpecialists[number - 1];
      if (!doctor) return;
      event.preventDefault();
      chooseDoctor(doctor);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseDoctor, filteredSpecialists]);

  if (loading) {
    return <Spinner page text="LOR doktorlari yuklanmoqda..." />;
  }

  return (
    <div className="ldr-page">
      <div className={`ldr-inner ${confirmingDoctorId ? "ldr-picking" : ""}`}>
        <header className="ldr-hero">
          <div className="ldr-hero-time" aria-hidden="true">
            {clock}
          </div>
          <p className="ldr-hero-kicker">
            {getGreeting(time.hours)} · LOR bo'limi
          </p>
          <h1 className="ldr-hero-title">Bugun kim qabul qiladi?</h1>
          <p className="ldr-hero-sub">Guvohnomangizni tanlang — cheklar shu nomdan chiqadi.</p>
        </header>

        <Alert type="error" message={error} />

        {specialists.length > 6 ? (
          <div className="ldr-search">
            <QuickSearchInput
              label="Doktor qidirish"
              placeholder="Masalan: Aziz"
              value={doctorSearch}
              onChange={setDoctorSearch}
              items={specialists}
              getItemLabel={(item) => item?.name || ""}
              onPick={(item) => setDoctorSearch(item?.name || "")}
              emptyText="Mos doktor topilmadi"
            />
          </div>
        ) : null}

        {specialists.length ? (
          <div className="ldr-badges">
            {filteredSpecialists.map((doctor, index) => {
              const lastUsed = lorDoctor?.id === doctor._id;
              const picked = confirmingDoctorId === doctor._id;
              const shortcut = index < MAX_SHORTCUT ? index + 1 : null;
              return (
                <button
                  key={doctor._id}
                  type="button"
                  className={`ldr-badge-wrap ${picked ? "is-picked" : ""} ${doctor.pro ? "is-pro" : ""}`}
                  style={{ "--i": index }}
                  disabled={Boolean(confirmingDoctorId)}
                  onClick={() => chooseDoctor(doctor)}
                  aria-label={`${doctor.name} nomidan ishlash`}
                >
                  <span className="ldr-lift">
                    <span className="ldr-lanyard" aria-hidden="true" />
                    <span className="ldr-clip" aria-hidden="true" />
                    <span className={`ldr-badge ${doctor.pro ? "ldr-tone-gold" : `ldr-tone-${getAvatarTone(doctor.name)}`}`}>
                      <span className="ldr-badge-band">
                        <span>SAMPI MEDICINE</span>
                        <span>{doctor.pro ? "★ PRO" : "LOR"}</span>
                      </span>
                      <span className="ldr-avatar">
                        {getDoctorInitials(doctor.name)}
                        <span className="ldr-check" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                      </span>
                      <span className="ldr-name">{doctor.name}</span>
                      <span className="ldr-role">
                        {picked ? "Smena boshlandi" : doctor.pro ? "Tajribali LOR shifokor" : "LOR shifokor"}
                      </span>
                      <span className="ldr-badge-foot">
                        {shortcut ? <kbd>{shortcut}</kbd> : <span />}
                        {lastUsed ? <span className="ldr-last">Oxirgi marta</span> : null}
                        <span className="ldr-barcode" aria-hidden="true" />
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="ldr-empty">
            Hozircha doktor yo'q. Menyudagi "Sozlamalar → Doktorlar" bo'limida qo'shing.
          </div>
        )}

        {specialists.length > 0 && filteredSpecialists.length === 0 ? (
          <div className="ldr-empty">Qidiruv bo'yicha doktor topilmadi.</div>
        ) : null}

        {filteredSpecialists.length > 1 ? (
          <p className="ldr-hint">
            Klaviaturada <kbd>1</kbd>–<kbd>{Math.min(filteredSpecialists.length, MAX_SHORTCUT)}</kbd> tugmasini
            bossangiz ham bo'ladi
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default LorSelectPage;
