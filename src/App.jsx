import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RequireLorIdentity from "./components/RequireLorIdentity.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NurseDashboard from "./pages/NurseDashboard.jsx";
import NurseChecksPage from "./pages/NurseChecksPage.jsx";
import NurseMedicinesPage from "./pages/NurseMedicinesPage.jsx";
import NurseServicesPage from "./pages/NurseServicesPage.jsx";
import LorSelectPage from "./pages/LorSelectPage.jsx";
import LorChecksPage from "./pages/LorChecksPage.jsx";
import LorServicesPage from "./pages/LorServicesPage.jsx";
import LorServiceCreatePage from "./pages/LorServiceCreatePage.jsx";
import RoleSpecialistsPage from "./pages/RoleSpecialistsPage.jsx";
import DeliveryDashboard from "./pages/DeliveryDashboard.jsx";
import CashierDashboard from "./pages/CashierDashboard.jsx";
import ManagerDashboard from "./pages/ManagerDashboard.jsx";
import ManagerStockPage from "./pages/ManagerStockPage.jsx";
import ManagerMostUsedPage from "./pages/ManagerMostUsedPage.jsx";
import ManagerUsageHistoryPage from "./pages/ManagerUsageHistoryPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { roleHomePath } from "./utils/constants.js";

function App() {
  const { token, role, lorIdentity } = useAuth();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const closeKeyboard = () => {
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const isEditable = active.matches("input, textarea, select, [contenteditable='true']");
    if (isEditable) active.blur();
  };

  useEffect(() => {
    const allowCopyForTarget = (target) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          "input, textarea, [contenteditable='true'], [data-allow-copy='true'], .allow-copy, .allow-select"
        )
      );
    };

    const onKeyDown = (event) => {
      const isCopyShortcut =
        (event.ctrlKey || event.metaKey) &&
        (event.key?.toLowerCase() === "c" || event.code === "KeyC");
      if (isCopyShortcut && !allowCopyForTarget(event.target)) {
        event.preventDefault();
      }
    };

    const onCopy = (event) => {
      if (!allowCopyForTarget(event.target)) {
        event.preventDefault();
      }
    };

    const onSelectStart = (event) => {
      if (!allowCopyForTarget(event.target)) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("selectstart", onSelectStart);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("selectstart", onSelectStart);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const root = document.documentElement;
    let rafId = 0;

    const updateKeyboardState = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const visibleHeight = viewport?.height ?? layoutHeight;
        const keyboardHeight = Math.max(0, Math.round(layoutHeight - visibleHeight));
        const isOpen = keyboardHeight > 120;

        setKeyboardOpen(isOpen);
        root.classList.toggle("mobile-kb-open", isOpen);
        root.style.setProperty("--sampi-kb-height", `${keyboardHeight}px`);
      });
    };

    const viewport = window.visualViewport;
    updateKeyboardState();
    window.addEventListener("resize", updateKeyboardState);
    window.addEventListener("orientationchange", updateKeyboardState);
    document.addEventListener("focusin", updateKeyboardState);
    document.addEventListener("focusout", updateKeyboardState);

    if (viewport) {
      viewport.addEventListener("resize", updateKeyboardState);
      viewport.addEventListener("scroll", updateKeyboardState);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateKeyboardState);
      window.removeEventListener("orientationchange", updateKeyboardState);
      document.removeEventListener("focusin", updateKeyboardState);
      document.removeEventListener("focusout", updateKeyboardState);
      if (viewport) {
        viewport.removeEventListener("resize", updateKeyboardState);
        viewport.removeEventListener("scroll", updateKeyboardState);
      }
      root.classList.remove("mobile-kb-open");
      root.style.removeProperty("--sampi-kb-height");
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (typeof document === "undefined") return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;

      const isEditable = active.matches("input, textarea, select, [contenteditable='true']");
      if (!isEditable) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable='true'], .sampi-dropdown, .sampi-kb-dismiss, [data-keep-keyboard='true']"
        )
      ) {
        return;
      }

      setTimeout(() => {
        if (document.activeElement === active) {
          active.blur();
        }
      }, 0);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const home =
    token && role
      ? role === "lor"
        ? lorIdentity
          ? "/lor/checks"
          : "/lor/select"
        : roleHomePath[role]
      : "/login";

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute allowedRoles={["nurse"]} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/nurse" element={<NurseDashboard />} />
            <Route path="/nurse/checks" element={<NurseChecksPage />} />
            <Route
              path="/nurse/specialists"
              element={<RoleSpecialistsPage mode="nurse" />}
            />
            <Route path="/nurse/medicines" element={<NurseMedicinesPage />} />
            <Route path="/nurse/services" element={<NurseServicesPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["lor"]} />}>
          <Route element={<DashboardLayout />}>
            <Route
              path="/lor"
              element={<Navigate to={lorIdentity ? "/lor/checks" : "/lor/select"} replace />}
            />
            <Route
              path="/lor/select"
              element={
                lorIdentity ? <Navigate to="/lor/checks" replace /> : <LorSelectPage />
              }
            />

            <Route element={<RequireLorIdentity />}>
              <Route path="/lor/checks" element={<LorChecksPage />} />
              <Route path="/lor/services" element={<LorServicesPage />} />
              <Route
                path="/lor/specialists"
                element={<RoleSpecialistsPage mode="lor" />}
              />
              <Route path="/lor/services/add" element={<LorServiceCreatePage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["delivery"]} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/delivery" element={<DeliveryDashboard />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["cashier"]} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/cashier" element={<Navigate to="/cashier/nurse-patients" replace />} />
            <Route
              path="/cashier/nurse-patients"
              element={<CashierDashboard forcedSection="nurse-patients" />}
            />
            <Route
              path="/cashier/lor-patients"
              element={<CashierDashboard forcedSection="lor-patients" />}
            />
            <Route
              path="/cashier/nurse-entries"
              element={<CashierDashboard forcedSection="nurse-entries" />}
            />
            <Route
              path="/cashier/nurse-history"
              element={<CashierDashboard forcedSection="nurse-history" />}
            />
            <Route
              path="/cashier/lor-entries"
              element={<CashierDashboard forcedSection="lor-entries" />}
            />
            <Route
              path="/cashier/lor-history"
              element={<CashierDashboard forcedSection="lor-history" />}
            />
            <Route
              path="/cashier/nurse-specialists"
              element={<CashierDashboard forcedSection="nurse-specialists" />}
            />
            <Route
              path="/cashier/lor-specialists"
              element={<CashierDashboard forcedSection="lor-specialists" />}
            />
            <Route
              path="/cashier/journal"
              element={<CashierDashboard forcedSection="journal" />}
            />
            <Route
              path="/cashier/debts"
              element={<CashierDashboard forcedSection="debts" />}
            />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["manager"]} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/manager" element={<ManagerDashboard />} />
            <Route path="/manager/stock" element={<ManagerStockPage />} />
            <Route path="/manager/most-used" element={<ManagerMostUsedPage />} />
            <Route path="/manager/usage-history" element={<ManagerUsageHistoryPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {keyboardOpen ? (
        <button
          type="button"
          aria-label="Klaviaturani yopish"
          onClick={closeKeyboard}
          className="sampi-kb-dismiss sm:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M6 10l6 6 6-6" />
          </svg>
          Yopish
        </button>
      ) : null}
    </>
  );
}

export default App;
