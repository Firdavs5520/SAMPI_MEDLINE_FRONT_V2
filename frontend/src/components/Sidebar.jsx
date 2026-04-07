import { NavLink } from "react-router-dom";
import { sidebarMenus } from "../utils/constants.js";
import { useAuth } from "../context/AuthContext.jsx";

function Sidebar({ open, onClose }) {
  const { role } = useAuth();
  const menus = sidebarMenus[role] || [];
  const hasGroups = menus.some((item) => item.group);
  const groupedMenus = hasGroups
    ? menus.reduce((acc, item) => {
        const groupName = item.group || "Boshqa";
        const lastGroup = acc[acc.length - 1];

        if (!lastGroup || lastGroup.name !== groupName) {
          acc.push({ name: groupName, items: [item] });
          return acc;
        }

        lastGroup.items.push(item);
        return acc;
      }, [])
    : [];

  const linkClassName = ({ isActive }) =>
    `block rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive ? "bg-primary text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-[82vw] max-w-xs transform border-r border-slate-200 bg-white transition lg:static lg:w-64 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Sampi Medline</h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <nav className="space-y-3 overflow-y-auto p-4">
          {hasGroups
            ? groupedMenus.map((group) => (
                <div key={group.name} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2">
                  <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {group.name}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.end === true}
                        onClick={onClose}
                        className={linkClassName}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))
            : menus.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end === true}
                  onClick={onClose}
                  className={linkClassName}
                >
                  {item.label}
                </NavLink>
              ))}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
