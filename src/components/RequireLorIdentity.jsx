import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function RequireLorIdentity() {
  const location = useLocation();
  const { role, lorIdentity, lorDoctor } = useAuth();

  if (role !== "lor") {
    return <Outlet />;
  }

  const isSelectPage = location.pathname === "/lor/select";
  const hasIdentity = Boolean(lorIdentity);
  const needsDoctor = location.pathname === "/lor/services";

  if (!hasIdentity && !isSelectPage) {
    return <Navigate to="/lor/select" replace state={{ from: location }} />;
  }

  if (needsDoctor && !lorDoctor?.id) {
    return <Navigate to="/lor/select" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireLorIdentity;
