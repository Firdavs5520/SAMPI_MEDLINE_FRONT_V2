import { useEffect, useMemo, useRef, useState } from "react";
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

const DOCTOR_CONFIRM_DELAY_MS = 460;
const ACTIVE_LOR_IDENTITY = "lor1";

function LorSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lorIdentity, lorDoctor, setLorIdentity, setLorDoctor } = useAuth();

  const [selectedLor, setSelectedLor] = useState(ACTIVE_LOR_IDENTITY);
  const [specialists, setSpecialists] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [confirmingDoctorId, setConfirmingDoctorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const doctorTimerRef = useRef(null);

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

  useEffect(() => {
    if (lorIdentity !== ACTIVE_LOR_IDENTITY) {
      setLorIdentity(ACTIVE_LOR_IDENTITY);
    }
    if (selectedLor !== ACTIVE_LOR_IDENTITY) {
      setSelectedLor(ACTIVE_LOR_IDENTITY);
    }
  }, [lorIdentity, selectedLor, setLorIdentity]);

  useEffect(
    () => () => {
      if (doctorTimerRef.current) {
        window.clearTimeout(doctorTimerRef.current);
      }
    },
    []
  );

  const resetDoctorSearch = () => {
    if (doctorTimerRef.current) {
      window.clearTimeout(doctorTimerRef.current);
      doctorTimerRef.current = null;
    }
    setConfirmingDoctorId("");
    setDoctorSearch("");
    setLorIdentity(ACTIVE_LOR_IDENTITY);
  };

  const chooseDoctor = (doctor) => {
    if (!selectedLor || confirmingDoctorId) return;
    const doctorId = doctor?._id;
    if (!doctorId) return;

    setConfirmingDoctorId(doctorId);
    doctorTimerRef.current = window.setTimeout(() => {
      setLorDoctor({ id: doctorId, name: doctor?.name });
      setConfirmingDoctorId("");
      doctorTimerRef.current = null;
      navigate(returnPath, { replace: true });
    }, DOCTOR_CONFIRM_DELAY_MS);
  };

  if (loading) {
    return <Spinner text="LOR doktorlari yuklanmoqda..." />;
  }

  return (
    <div className={`lor-select-shell ${confirmingDoctorId ? "lor-select-shell-switching" : ""}`}>
      <div className="lor-select-glow" />
      <div className="lor-select-card lor-ios-card route-enter">
        <div className="lor-select-header">
          <span className="lor-select-chip">Doktor tanlash</span>
          <h1 className="text-balance text-3xl font-extrabold text-slate-900 sm:text-[2rem]">
            Qaysi doktor nomidan ishlaysiz?
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
            {selectedLorLabel} faol. Chek chiqaradigan doktorni belgilang.
          </p>
        </div>

        <Alert type="error" message={error} />

        <div className="lor-step-track" aria-label="LOR tanlash bosqichlari">
          <span className="lor-step-dot lor-step-dot-active">Doktor</span>
        </div>

        <div className="mt-7">
            <section
              key="doctor-step"
              className="lor-select-section lor-select-stage lor-doctor-stage lor-stage-in"
            >
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
                  <Button variant="secondary" className="px-3 py-2 text-xs" onClick={resetDoctorSearch}>
                    Qidiruvni tozalash
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
                  {filteredSpecialists.map((doctor, index) => {
                    const selected = lorDoctor?.id === doctor._id;
                    const confirming = confirmingDoctorId === doctor._id;
                    return (
                      <button
                        key={doctor._id}
                        type="button"
                        className={`lor-doctor-card ${
                          selected ? "lor-doctor-card-selected" : ""
                        } ${confirming ? "lor-doctor-card-confirming" : ""}`}
                        disabled={Boolean(confirmingDoctorId)}
                        style={{ "--item-index": index }}
                        onClick={() => chooseDoctor(doctor)}
                      >
                        <span className="lor-doctor-avatar">{getDoctorInitials(doctor.name)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-900">
                            {doctor.name}
                          </span>
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {confirming
                              ? "Ochilmoqda"
                              : selected
                                ? "Hozir tanlangan"
                                : "Shu doktor bilan ishlash"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="lor-doctor-empty mt-4">
                  Hozircha doktor yo'q. Doktorlarni chap menyudagi boshqaruv sahifasidan kiriting.
                </div>
              )}

              {specialists.length > 0 && filteredSpecialists.length === 0 ? (
                <div className="lor-doctor-empty mt-4">Qidiruv bo'yicha doktor topilmadi.</div>
              ) : null}
            </section>
        </div>
      </div>
    </div>
  );
}

export default LorSelectPage;
