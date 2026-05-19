import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { roleHomePath, roleLabels, sidebarMenus } from "../utils/constants.js";
import Button from "./Button.jsx";
import ThemeModeSwitch from "./ThemeModeSwitch.jsx";

const LEGACY_NAME_MAP = {
  "Nurse User": "Hamshira",
  "LOR Doctor": "LOR shifokor",
  "Delivery User": "Yetkazuvchi",
  "Manager User": "Menejer",
  "Cashier User": "Kassir"
};

const getDisplayName = (user) => {
  const roleLabel = roleLabels[user?.role] || "-";
  const rawName = String(user?.name || "").trim();
  if (!rawName) return roleLabel;
  return LEGACY_NAME_MAP[rawName] || rawName;
};

const getPageLabel = (role, pathname) => {
  const menus = sidebarMenus[role] || [];
  const current = menus.find((item) => item.path === pathname);
  return current?.label || roleLabels[role] || "Sampi Medline";
};

function Navbar({ onMenuOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const displayName = getDisplayName(user);
  const pageLabel = getPageLabel(user?.role, location.pathname);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleGoHome = () => {
    if (user?.role) {
      navigate(roleHomePath[user.role]);
    }
  };

  return (
    <header
      className="sampi-navbar sticky top-0 z-20 border-b border-slate-200 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onMenuOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            aria-label="Menyuni ochish"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleGoHome}
            className="sampi-navbar-home hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black sm:inline-flex"
            aria-label="Bosh sahifa"
            title="Bosh sahifa"
          >
            SM
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-900 sm:text-base">
              {pageLabel}
            </div>
            <div className="hidden truncate text-xs font-semibold text-slate-500 sm:block">
              {roleLabels[user?.role] || "-"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleGoHome}
            className="sampi-navbar-user hidden min-w-0 rounded-xl px-2.5 py-1.5 text-left text-sm md:block"
          >
            <div className="sampi-navbar-user-name max-w-[10rem] truncate font-semibold">{displayName}</div>
            <div className="sampi-navbar-user-role truncate text-xs">
              {roleLabels[user?.role] || "-"}
            </div>
          </button>
          <ThemeModeSwitch compact />
          <Button
            variant="secondary"
            onClick={handleLogout}
            className="shrink-0 px-3 py-2 text-xs sm:text-sm"
          >
            Chiqish
          </Button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
