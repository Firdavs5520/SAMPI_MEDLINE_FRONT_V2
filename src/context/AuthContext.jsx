/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import authService from "../services/authService.js";
import { storageKeys } from "../utils/constants.js";

const AuthContext = createContext(null);
const ACTIVE_LOR_IDENTITY = "lor1";

const normalizeLorIdentity = (value) => {
  const safe = String(value || "").trim().toLowerCase();
  return safe === ACTIVE_LOR_IDENTITY ? ACTIVE_LOR_IDENTITY : "";
};

const parseUser = () => {
  try {
    const rawUser = localStorage.getItem(storageKeys.user);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

const parseStoredSpecialist = (key) => {
  try {
    const rawDoctor =
      sessionStorage.getItem(key) ||
      localStorage.getItem(key);
    const doctor = rawDoctor ? JSON.parse(rawDoctor) : null;
    if (!doctor?.id || !doctor?.name) return null;
    return {
      id: String(doctor.id),
      name: String(doctor.name)
    };
  } catch {
    return null;
  }
};

const parseLorDoctor = () => parseStoredSpecialist(storageKeys.lorDoctor);
const parseNurseSpecialist = () => parseStoredSpecialist(storageKeys.nurseSpecialist);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(storageKeys.token));
  const [user, setUser] = useState(parseUser);
  const [lorIdentity, setLorIdentityState] = useState(
    normalizeLorIdentity(
      sessionStorage.getItem(storageKeys.lorIdentity) ||
        localStorage.getItem(storageKeys.lorIdentity) ||
        ""
    )
  );
  const [lorDoctor, setLorDoctorState] = useState(parseLorDoctor);
  const [nurseSpecialist, setNurseSpecialistState] = useState(parseNurseSpecialist);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const localLorIdentity = localStorage.getItem(storageKeys.lorIdentity);
    if (localLorIdentity) {
      const safeLorIdentity = normalizeLorIdentity(localLorIdentity);
      if (safeLorIdentity) {
        sessionStorage.setItem(storageKeys.lorIdentity, safeLorIdentity);
      } else {
        sessionStorage.removeItem(storageKeys.lorIdentity);
      }
      localStorage.removeItem(storageKeys.lorIdentity);
      setLorIdentityState(safeLorIdentity);
    }

    const localLorDoctor = localStorage.getItem(storageKeys.lorDoctor);
    if (localLorDoctor) {
      sessionStorage.setItem(storageKeys.lorDoctor, localLorDoctor);
      localStorage.removeItem(storageKeys.lorDoctor);
      setLorDoctorState(parseLorDoctor());
    }

    const localNurseSpecialist = localStorage.getItem(storageKeys.nurseSpecialist);
    if (localNurseSpecialist) {
      sessionStorage.setItem(storageKeys.nurseSpecialist, localNurseSpecialist);
      localStorage.removeItem(storageKeys.nurseSpecialist);
      setNurseSpecialistState(parseNurseSpecialist());
    }
  }, []);

  const clearLorDoctor = useCallback(() => {
    sessionStorage.removeItem(storageKeys.lorDoctor);
    localStorage.removeItem(storageKeys.lorDoctor);
    setLorDoctorState(null);
  }, []);

  const clearNurseSpecialist = useCallback(() => {
    sessionStorage.removeItem(storageKeys.nurseSpecialist);
    localStorage.removeItem(storageKeys.nurseSpecialist);
    setNurseSpecialistState(null);
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const payload = await authService.login(email, password);
      localStorage.setItem(storageKeys.token, payload.token);
      localStorage.setItem(storageKeys.user, JSON.stringify(payload.user));
      setToken(payload.token);
      setUser(payload.user);

      if (payload.user?.role === "lor") {
        sessionStorage.removeItem(storageKeys.lorIdentity);
        localStorage.removeItem(storageKeys.lorIdentity);
        setLorIdentityState("");
        clearLorDoctor();
        clearNurseSpecialist();
      } else {
        sessionStorage.removeItem(storageKeys.lorIdentity);
        localStorage.removeItem(storageKeys.lorIdentity);
        setLorIdentityState("");
        clearLorDoctor();
        clearNurseSpecialist();
      }

      return payload.user;
    } finally {
      setLoading(false);
    }
  }, [clearLorDoctor, clearNurseSpecialist]);

  const setLorIdentity = useCallback((value) => {
    const safeValue = normalizeLorIdentity(value);
    if (!safeValue) {
      sessionStorage.removeItem(storageKeys.lorIdentity);
      localStorage.removeItem(storageKeys.lorIdentity);
      setLorIdentityState("");
      clearLorDoctor();
      return;
    }

    sessionStorage.setItem(storageKeys.lorIdentity, safeValue);
    localStorage.removeItem(storageKeys.lorIdentity);
    setLorIdentityState(safeValue);
    clearLorDoctor();
  }, [clearLorDoctor]);

  const setLorDoctor = useCallback((doctor) => {
    const safeDoctor = {
      id: String(doctor?.id || doctor?._id || "").trim(),
      name: String(doctor?.name || "").trim()
    };

    if (!safeDoctor.id || !safeDoctor.name) {
      clearLorDoctor();
      return;
    }

    sessionStorage.setItem(storageKeys.lorDoctor, JSON.stringify(safeDoctor));
    localStorage.removeItem(storageKeys.lorDoctor);
    setLorDoctorState(safeDoctor);
  }, [clearLorDoctor]);

  const setNurseSpecialist = useCallback((specialist) => {
    const safeSpecialist = {
      id: String(specialist?.id || specialist?._id || "").trim(),
      name: String(specialist?.name || "").trim()
    };

    if (!safeSpecialist.id || !safeSpecialist.name) {
      clearNurseSpecialist();
      return;
    }

    sessionStorage.setItem(storageKeys.nurseSpecialist, JSON.stringify(safeSpecialist));
    localStorage.removeItem(storageKeys.nurseSpecialist);
    setNurseSpecialistState(safeSpecialist);
  }, [clearNurseSpecialist]);

  const logout = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.lorIdentity);
    localStorage.removeItem(storageKeys.lorDoctor);
    localStorage.removeItem(storageKeys.nurseSpecialist);
    sessionStorage.removeItem(storageKeys.lorIdentity);
    sessionStorage.removeItem(storageKeys.lorDoctor);
    sessionStorage.removeItem(storageKeys.nurseSpecialist);
    setToken(null);
    setUser(null);
    setLorIdentityState("");
    setLorDoctorState(null);
    setNurseSpecialistState(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      role: user?.role || null,
      token,
      lorIdentity,
      lorDoctor,
      nurseSpecialist,
      loading,
      isAuthenticated: Boolean(token),
      login,
      setLorIdentity,
      setLorDoctor,
      clearLorDoctor,
      setNurseSpecialist,
      clearNurseSpecialist,
      logout
    }),
    [
      user,
      token,
      lorIdentity,
      lorDoctor,
      nurseSpecialist,
      loading,
      login,
      setLorIdentity,
      setLorDoctor,
      clearLorDoctor,
      setNurseSpecialist,
      clearNurseSpecialist,
      logout
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
