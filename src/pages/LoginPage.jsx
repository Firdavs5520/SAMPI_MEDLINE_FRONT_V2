import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage } from "../utils/format.js";
import { roleHomePath } from "../utils/constants.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";

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
      setError("Email va parol kiritilishi shart.");
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
    <div className="sampi-login-shell route-enter flex min-h-screen items-center justify-center p-3 sm:p-6">
      <div className="sampi-login-card grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl shadow-cyan-950/10 backdrop-blur lg:grid-cols-[1.05fr_0.95fr]">
        <section className="sampi-login-visual hidden min-h-[36rem] flex-col justify-center p-8 lg:flex">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/70 bg-white/75 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-cyan-800 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              sampi-medline.vercel.app
            </div>
            <h1 className="mt-7 max-w-md text-4xl font-black leading-tight text-slate-950">
              Sampi Medline
            </h1>
            <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-slate-600">
              Klinikadagi ish oqimi uchun yagona boshqaruv paneli.
            </p>
          </div>
        </section>

        <section className="flex min-h-[35rem] items-center p-4 sm:p-8">
          <div className="sampi-login-form-card w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/10 sm:p-7">
            <div className="mb-7 flex items-start justify-between gap-3">
              <div>
                <div className="sampi-login-mark mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-base font-black">
                  SM
                </div>
                <h1 className="text-2xl font-black text-slate-900">Sampi Medline</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">Tizimga kirish</p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                Online
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="email@example.com"
                value={form.email}
                autoComplete="email"
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <Input
                label="Parol"
                type="password"
                placeholder="********"
                value={form.password}
                autoComplete="current-password"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />

              <Alert type="error" message={error} />

              <Button type="submit" loading={loading} className="w-full">Kirish</Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
