import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AccessDeniedPage from "../pages/AccessDeniedPage.jsx";
import { roleHomePath } from "../utils/constants.js";

function ProtectedRoute({ allowedRoles }) {
  const { token, role, lorIdentity } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    const homePath =
      role === "lor"
        ? lorIdentity
          ? "/lor/checks"
          : "/lor/select"
        : roleHomePath[role] || null;

    if (homePath && location.pathname !== homePath) {
      return <Navigate to={homePath} replace />;
    }

    return <AccessDeniedPage />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
