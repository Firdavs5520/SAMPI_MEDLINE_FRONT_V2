import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage } from "../utils/format.js";
import { roleHomePath } from "../utils/constants.js";
import Alert from "../components/Alert.jsx";
import { showFieldError } from "../utils/fieldError.js";

// Brauzer parolni saqlashni taklif qilmasligi uchun parol oddiy matn maydonida, belgilar
// CSS (-webkit-text-security) bilan yashiriladi. Qo'llanmasa oddiy password maydoni.
const MASKED_TEXT_SUPPORTED =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-text-security", "disc");

const APP_VERSION = __APP_VERSION__;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DEPARTMENTS = ["LOR", "Hamshira", "Kassa", "Hisobot", "TV navbat"];

const formatClock = (now) => {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
};

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open ? null : <path d="M4 20 20 4" />}
    </svg>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { login, token, role, lorIdentity, lorDoctor, loading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const homePath =
    role === "lor" ? (lorIdentity && lorDoctor?.id ? "/lor/services" : "/lor/select") : roleHomePath[role];

  if (token && role) {
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email) {
      showFieldError("login-email", "Emailni kiriting.");
      return;
    }

    if (!form.password) {
      showFieldError("login-password", "Parolni kiriting.");
      return;
    }

    try {
      const user = await login(form.email, form.password);
      navigate(user.role === "lor" ? "/lor/select" : roleHomePath[user.role], { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const passwordMasked = !showPassword;

  return (
    <div className="lgn-page">
      <div className="lgn-frame">
        <section className="lgn-brand" aria-hidden="true">
          <div className="lgn-blob lgn-blob-a" />
          <div className="lgn-blob lgn-blob-b" />
          <div className="lgn-brand-top">
            <span className="lgn-logo">SM</span>
            <span className="lgn-clock">{formatClock(now)}</span>
          </div>

          <div className="lgn-brand-main">
            <p className="lgn-wordmark">
              <span>SAMPI</span> <strong>MEDICINE</strong>
            </p>
            <p className="lgn-tagline">Klinika ish oqimi — bitta joyda.</p>
            {/* Yurak urishi (EKG) chizig'i: chiziq doimiy "yugurib" turadi. */}
            <svg className="lgn-ecg" viewBox="0 0 600 120" preserveAspectRatio="none">
              <path
                className="lgn-ecg-base"
                d="M0 70 H150 L175 70 L190 40 L205 100 L222 18 L240 110 L256 70 H330 L350 70 L362 52 L374 70 H600"
              />
              <path
                className="lgn-ecg-pulse"
                pathLength="100"
                d="M0 70 H150 L175 70 L190 40 L205 100 L222 18 L240 110 L256 70 H330 L350 70 L362 52 L374 70 H600"
              />
            </svg>
          </div>

          <ul className="lgn-departments">
            {DEPARTMENTS.map((name, index) => (
              <li key={name} style={{ "--i": index }}>
                {name}
              </li>
            ))}
          </ul>
        </section>

        <section className="lgn-form-side">
          <form className="lgn-form" onSubmit={handleSubmit} noValidate>
            <div className="lgn-form-head">
              <span className="lgn-logo lgn-logo-small" aria-hidden="true">
                SM
              </span>
              <h1>Xush kelibsiz</h1>
              <p>Ishni boshlash uchun hisobingizga kiring</p>
            </div>

            <div className="lgn-field" data-field="login-email">
              <label htmlFor="login-email">Email</label>
              <div className="lgn-input">
                <MailIcon />
                <input
                  id="login-email"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="lgn-field" data-field="login-password">
              <label htmlFor="login-password">Parol</label>
              <div className="lgn-input">
                <LockIcon />
                <input
                  id="login-password"
                  type={MASKED_TEXT_SUPPORTED || !passwordMasked ? "text" : "password"}
                  className={MASKED_TEXT_SUPPORTED && passwordMasked ? "sampi-masked" : ""}
                  autoCapitalize="none"
                  autoComplete={MASKED_TEXT_SUPPORTED ? "off" : "current-password"}
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="lgn-eye"
                  aria-label={passwordMasked ? "Parolni ko'rsatish" : "Parolni yashirish"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <EyeIcon open={!passwordMasked} />
                </button>
              </div>
            </div>

            <Alert type="error" message={error} />

            <button type="submit" className="lgn-submit" disabled={loading}>
              {loading ? (
                <span className="lgn-submit-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <>
                  Kirish
                  <span className="lgn-submit-arrow" aria-hidden="true">
                    →
                  </span>
                </>
              )}
            </button>

            <p className="lgn-foot">
              v{APP_VERSION} · Toshkent
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
