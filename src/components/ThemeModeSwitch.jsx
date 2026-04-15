import { useTheme } from "../context/ThemeContext.jsx";
const THEME_OPTIONS = ["light", "dark", "system"];
const THEME_LABELS = {
  light: "Yorug'",
  dark: "Qorong'i",
  system: "Tizim"
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0-1.22 7.79 9.79 9.79z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

const THEME_ICONS = {
  light: <SunIcon />,
  dark: <MoonIcon />,
  system: <SystemIcon />
};

function ThemeModeSwitch({ compact = false }) {
  const { mode, setMode } = useTheme();

  const nextMode = () => {
    const currentIndex = THEME_OPTIONS.indexOf(mode);
    const index = currentIndex >= 0 ? currentIndex : 0;
    return THEME_OPTIONS[(index + 1) % THEME_OPTIONS.length];
  };

  const handleToggle = () => {
    setMode(nextMode());
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "w-full sm:w-auto"}`}>
      {!compact ? <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tema</span> : null}
      <button
        type="button"
        onClick={handleToggle}
        className={`sampi-theme-toggle sampi-control inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${compact ? "min-w-[108px] justify-center px-2.5" : "w-full sm:min-w-[138px] sm:justify-start"}`}
        title={`Joriy: ${THEME_LABELS[mode]} | Bosganda: ${THEME_LABELS[nextMode()]}`}
        aria-label={`Tema: ${THEME_LABELS[mode]}`}
      >
        <span className="inline-flex items-center justify-center text-primary">{THEME_ICONS[mode]}</span>
        <span>{THEME_LABELS[mode]}</span>
      </button>
    </div>
  );
}

export default ThemeModeSwitch;
