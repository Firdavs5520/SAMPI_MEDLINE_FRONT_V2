import { useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Navbar from "../components/Navbar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const SIDEBAR_COMPACT_KEY = "sampi_sidebar_compact";

const getRouteMotion = (previousPath, currentPath) => {
  if (previousPath === currentPath) return "steady";
  const previousDepth = previousPath.split("/").filter(Boolean).length;
  const currentDepth = currentPath.split("/").filter(Boolean).length;
  if (currentDepth < previousDepth) return "back";
  return "forward";
};

function DashboardLayout() {
  const location = useLocation();
  const { role } = useAuth();
  const previousPathRef = useRef(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COMPACT_KEY) === "1";
  });
  const [routeMotion, setRouteMotion] = useState("steady");
  const isLorSelectPage = role === "lor" && location.pathname === "/lor/select";
  const routeClassName = `route-enter page-motion page-motion-${routeMotion}`;

  const handleToggleSidebarCompact = () => {
    setSidebarCompact((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COMPACT_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  useLayoutEffect(() => {
    setRouteMotion(getRouteMotion(previousPathRef.current, location.pathname));
    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  if (isLorSelectPage) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="min-w-0 p-2.5 pb-4 sm:p-4 lg:p-6">
          <div key={location.pathname} className={routeClassName}>
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen w-full overflow-x-hidden bg-slate-100">
      <div className="sampi-shell-texture" aria-hidden="true" />
      <Sidebar
        open={sidebarOpen}
        compact={sidebarCompact}
        onClose={() => setSidebarOpen(false)}
        onToggleCompact={handleToggleSidebarCompact}
      />

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <Navbar onMenuOpen={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 p-2.5 pb-4 sm:p-4 lg:p-6">
          <div key={location.pathname} className={routeClassName}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
