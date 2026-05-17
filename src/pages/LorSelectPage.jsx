import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
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

function LorSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lorIdentity, lorDoctor, setLorIdentity, setLorDoctor } = useAuth();

  const [selectedLor, setSelectedLor] = useState(lorIdentity || "");
  const [specialists, setSpecialists] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const returnPath = location.state?.from?.pathname || "/lor/checks";
  const selectedLorLabel = selectedLor ? selectedLor.toUpperCase() : "";

  const filteredSpecialists = useMemo(() => {
    const query = normalizeSearch(doctorSearch);
    if (!query) return specialists;
    return specialists.filter((item) => normalizeSearch(item?.name).includes(query));
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

  const chooseLor = (value) => {
    setSelectedLor(value);
    setDoctorSearch("");
    setLorIdentity(value);
  };

  const changeCabinet = () => {
    setSelectedLor("");
    setDoctorSearch("");
    setLorIdentity("");
  };

  const chooseDoctor = (doctor) => {
    if (!selectedLor) return;
    setLorDoctor({ id: doctor?._id, name: doctor?.name });
    navigate(returnPath, { replace: true });
  };

  const goManageDoctors = () => {
    if (!selectedLor) {
      setError("Avval LOR-1 yoki LOR-2 ni tanlang.");
      return;
    }
    navigate("/lor/specialists");
  };

  if (loading) {
    return <Spinner text="LOR doktorlari yuklanmoqda..." />;
  }

  return (
    <div className="lor-select-shell">
      <div className="lor-select-glow" />
      <div className="lor-select-card route-enter">
        <div className="lor-select-header">
          <span className="lor-select-chip">
            {selectedLor ? "Doktor tanlash" : "LOR ish joyi"}
          </span>
          <h1 className="text-balance text-3xl font-extrabold text-slate-900 sm:text-[2rem]">
            {selectedLor ? "Qaysi doktor nomidan ishlaysiz?" : "Avval kabinetni tanlang"}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
            {selectedLor
              ? `${selectedLorLabel} tanlandi. Endi chek chiqaradigan doktorni belgilang.`
              : "LOR-1 yoki LOR-2 kabinetini tanlang. Keyingi qadamda barcha doktorlar chiqadi."}
          </p>
        </div>

        <Alert type="error" message={error} />

        <div className="lor-step-track" aria-label="LOR tanlash bosqichlari">
          <span
            className={`lor-step-dot ${
              selectedLor ? "lor-step-dot-done" : "lor-step-dot-active"
            }`}
          >
            1. Kabinet
          </span>
          <span className={`lor-step-line ${selectedLor ? "lor-step-line-done" : ""}`} />
          <span className={`lor-step-dot ${selectedLor ? "lor-step-dot-active" : ""}`}>
            2. Doktor
          </span>
        </div>

        <div className="mt-7">
          {!selectedLor ? (
            <section className="lor-select-section lor-select-stage">
              <div className="lor-stage-eyebrow">1-qadam</div>
              <h2 className="text-center text-2xl font-black text-slate-900">Kabinetni belgilang</h2>
              <p className="mx-auto mt-2 max-w-xl text-center text-sm font-semibold text-slate-500">
                Tanlovdan keyin bu qism yopiladi va doktorlar ro'yxati ochiladi.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  className="lor-choice-card lor-choice-primary"
                  onClick={() => chooseLor("lor1")}
                >
                  <div className="lor-choice-badge">LOR-1</div>
                  <p className="mt-2 text-lg font-bold text-slate-900">Asosiy kabinet</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Bemor qabulini LOR-1 nomida yuritish
                  </p>
                  <span className="lor-choice-action">Tanlash</span>
                </button>

                <button
                  type="button"
                  className="lor-choice-card lor-choice-secondary"
                  onClick={() => chooseLor("lor2")}
                >
                  <div className="lor-choice-badge">LOR-2</div>
                  <p className="mt-2 text-lg font-bold text-slate-900">Qo'shimcha kabinet</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Bemor qabulini LOR-2 nomida yuritish
                  </p>
                  <span className="lor-choice-action">Tanlash</span>
                </button>
              </div>
            </section>
          ) : (
            <section className="lor-select-section lor-select-stage lor-doctor-stage">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="lor-stage-eyebrow lor-stage-eyebrow-left">2-qadam</div>
                  <h2 className="text-2xl font-black text-slate-900">Doktorni tanlang</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {selectedLorLabel} uchun barcha doktorlar ro'yxati.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="lor-selected-mini">{selectedLorLabel}</span>
                  <Button variant="secondary" className="px-3 py-2 text-xs" onClick={changeCabinet}>
                    Kabinetni o'zgartirish
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={goManageDoctors}
                  >
                    Doktor qo'shish
                  </Button>
                </div>
              </div>

              <div className="mt-5">
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

              {specialists.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredSpecialists.map((doctor) => {
                    const selected = lorDoctor?.id === doctor._id;
                    return (
                      <button
                        key={doctor._id}
                        type="button"
                        className={`lor-doctor-card ${selected ? "lor-doctor-card-selected" : ""}`}
                        onClick={() => chooseDoctor(doctor)}
                      >
                        <span className="lor-doctor-avatar">{getDoctorInitials(doctor.name)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-900">
                            {doctor.name}
                          </span>
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {selected ? "Hozir tanlangan" : "Shu doktor bilan ishlash"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="lor-doctor-empty mt-4">
                  Hozircha doktor yo'q. "Doktor qo'shish" orqali avval ro'yxatga doktor kiriting.
                </div>
              )}

              {specialists.length > 0 && filteredSpecialists.length === 0 ? (
                <div className="lor-doctor-empty mt-4">Qidiruv bo'yicha doktor topilmadi.</div>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default LorSelectPage;
