/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import authService from "../services/authService.js";
import { storageKeys } from "../utils/constants.js";

const AuthContext = createContext(null);

const parseUser = () => {
  try {
    const rawUser = localStorage.getItem(storageKeys.user);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

const parseLorDoctor = () => {
  try {
    const rawDoctor =
      sessionStorage.getItem(storageKeys.lorDoctor) ||
      localStorage.getItem(storageKeys.lorDoctor);
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

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(storageKeys.token));
  const [user, setUser] = useState(parseUser);
  const [lorIdentity, setLorIdentityState] = useState(
    sessionStorage.getItem(storageKeys.lorIdentity) ||
      localStorage.getItem(storageKeys.lorIdentity) ||
      ""
  );
  const [lorDoctor, setLorDoctorState] = useState(parseLorDoctor);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const localLorIdentity = localStorage.getItem(storageKeys.lorIdentity);
    if (localLorIdentity) {
      sessionStorage.setItem(storageKeys.lorIdentity, localLorIdentity);
      localStorage.removeItem(storageKeys.lorIdentity);
      setLorIdentityState(String(localLorIdentity || "").trim().toLowerCase());
    }

    const localLorDoctor = localStorage.getItem(storageKeys.lorDoctor);
    if (localLorDoctor) {
      sessionStorage.setItem(storageKeys.lorDoctor, localLorDoctor);
      localStorage.removeItem(storageKeys.lorDoctor);
      setLorDoctorState(parseLorDoctor());
    }
  }, []);

  const clearLorDoctor = useCallback(() => {
    sessionStorage.removeItem(storageKeys.lorDoctor);
    localStorage.removeItem(storageKeys.lorDoctor);
    setLorDoctorState(null);
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
      } else {
        sessionStorage.removeItem(storageKeys.lorIdentity);
        localStorage.removeItem(storageKeys.lorIdentity);
        setLorIdentityState("");
        clearLorDoctor();
      }

      return payload.user;
    } finally {
      setLoading(false);
    }
  }, [clearLorDoctor]);

  const setLorIdentity = useCallback((value) => {
    const safeValue = String(value || "").trim().toLowerCase();
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

  const logout = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.lorIdentity);
    localStorage.removeItem(storageKeys.lorDoctor);
    sessionStorage.removeItem(storageKeys.lorIdentity);
    sessionStorage.removeItem(storageKeys.lorDoctor);
    setToken(null);
    setUser(null);
    setLorIdentityState("");
    setLorDoctorState(null);
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
      loading,
      isAuthenticated: Boolean(token),
      login,
      setLorIdentity,
      setLorDoctor,
      clearLorDoctor,
      logout
    }),
    [
      user,
      token,
      lorIdentity,
      lorDoctor,
      loading,
      login,
      setLorIdentity,
      setLorDoctor,
      clearLorDoctor,
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
