import { useTheme } from "../context/ThemeContext.jsx";
import SelectMenu from "./SelectMenu.jsx";

const THEME_OPTIONS = [
  { value: "light", label: "Yorug'" },
  { value: "dark", label: "Qorong'i" },
  { value: "system", label: "Tizim" }
];

function ThemeModeSwitch({ compact = false }) {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "w-full sm:w-auto"}`}>
      <SelectMenu
        label={compact ? "" : "Tema"}
        value={mode}
        options={THEME_OPTIONS}
        onChange={setMode}
        title={`Joriy tema: ${resolvedTheme === "dark" ? "Qorong'i" : "Yorug'"}`}
        className={compact ? "w-[108px]" : "w-full sm:w-[138px]"}
        buttonClassName={compact ? "px-2.5 py-2 text-xs font-semibold" : "text-xs font-semibold"}
        menuClassName={compact ? "w-[138px]" : ""}
      />
    </div>
  );
}

export default ThemeModeSwitch;
