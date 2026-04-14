import { useTheme } from "../context/ThemeContext.jsx";

const THEME_OPTIONS = [
  { value: "light", label: "Yorug'" },
  { value: "dark", label: "Qorong'i" },
  { value: "system", label: "Tizim" }
];

function ThemeModeSwitch({ compact = false }) {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "w-full sm:w-auto"}`}>
      {!compact ? (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tema
        </span>
      ) : null}
      <select
        value={mode}
        onChange={(event) => setMode(event.target.value)}
        className={`sampi-select sampi-control rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${
          compact ? "w-[105px]" : "w-full sm:w-[130px]"
        }`}
        title={`Joriy tema: ${resolvedTheme === "dark" ? "Qorong'i" : "Yorug'"}`}
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ThemeModeSwitch;
