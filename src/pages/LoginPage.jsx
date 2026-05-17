import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage } from "../utils/format.js";
import { roleHomePath } from "../utils/constants.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import ThemeModeSwitch from "../components/ThemeModeSwitch.jsx";

function LoginPage() {
  const navigate = useNavigate();
  const { login, token, role, lorIdentity, loading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const homePath =
    role === "lor" ? (lorIdentity ? "/lor/checks" : "/lor/select") : roleHomePath[role];

  if (token && role) {
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Elektron pochta va parol kiritilishi shart.");
      return;
    }

    try {
      const user = await login(form.email, form.password);
      navigate(user.role === "lor" ? "/lor/select" : roleHomePath[user.role], { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div
      className="sampi-login-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 sm:px-6"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))"
      }}
    >
      <div className="sampi-login-noise" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-end px-2 sm:px-4"
        style={{ top: "max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))" }}
      >
        <div className="pointer-events-auto">
          <ThemeModeSwitch compact />
        </div>
      </div>
      <div className="sampi-login-stage relative z-10 grid w-full max-w-6xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="sampi-login-story order-2 lg:order-1">
          <p className="sampi-login-eyebrow">Sampi Medline tizimi</p>
          <h1 className="sampi-login-title">
            Klinikadagi oqimni
            <span> bitta markazda boshqaring</span>
          </h1>
          <p className="sampi-login-subtitle">
            Qabul, chek, kassa va hisobotlar bir xil ritmda ishlashi uchun yaratilgan real
            vaqtli boshqaruv paneli.
          </p>

          <div className="sampi-login-flow">
            <div className="sampi-login-flow-item">
              <span className="sampi-login-flow-dot" />
              Hamshira va LOR cheklari bitta tizimda
            </div>
            <div className="sampi-login-flow-item">
              <span className="sampi-login-flow-dot" />
              Kassa va qarzdorlik nazorati aniq yuritiladi
            </div>
            <div className="sampi-login-flow-item">
              <span className="sampi-login-flow-dot" />
              Yetkazuvchi va menejer uchun jonli monitoring
            </div>
          </div>

          <div className="sampi-login-role-strip" aria-hidden="true">
            <span>Hamshira</span>
            <span>LOR</span>
            <span>Kassir</span>
            <span>Yetkazuvchi</span>
            <span>Menejer</span>
          </div>
        </section>

        <section className="sampi-login-panel order-1 card p-6 sm:p-7 lg:order-2">
          <div className="sampi-login-panel-head">
            <span className="sampi-login-brand-badge">SM</span>
            <div>
              <h2 className="text-[2rem] font-black leading-none text-slate-900">Sampi Medline</h2>
              <p className="mt-2 text-sm text-slate-500">Tizimga kirish</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off" className="mt-7 space-y-4">
            <Input
              label="Elektron pochta"
              type="email"
              className="sampi-login-input"
              placeholder="Elektron pochtangizni kiriting"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <Input
              label="Parol"
              type="password"
              className="sampi-login-input"
              placeholder="Parolingizni kiriting"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            />

            <Alert type="error" message={error} />

            <Button type="submit" loading={loading} className="sampi-login-submit w-full">
              Kirish
            </Button>

            <p className="sampi-login-hint">Barcha bo'limlar uchun yagona xavfsiz kirish</p>
          </form>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
