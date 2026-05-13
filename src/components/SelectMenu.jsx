import { useEffect, useId, useMemo, useRef, useState } from "react";

function SelectMenu({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  labelClassName = "",
  title = ""
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef(null);
  const labelId = useId();
  const listboxId = useId();
  const buttonId = useId();

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  const getSelectedIndex = () => {
    const selectedIndex = options.findIndex((option) => option.value === value);
    return selectedIndex >= 0 ? selectedIndex : 0;
  };

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  useEffect(() => {
    if (!open) return undefined;

    const closeFromEvent = () => {
      setOpen(false);
      setActiveIndex(-1);
    };

    const closeOnOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        closeFromEvent();
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        closeFromEvent();
      }
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectOption = (option) => {
    if (!option) return;
    onChange(option.value);
    closeMenu();
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled) return;

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "Tab") {
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(getSelectedIndex());
        setOpen(true);
        return;
      }
      setActiveIndex((prev) => {
        const start = prev < 0 ? 0 : prev + 1;
        return Math.min(options.length - 1, start);
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(getSelectedIndex());
        setOpen(true);
        return;
      }
      setActiveIndex((prev) => {
        const start = prev < 0 ? options.length - 1 : prev - 1;
        return Math.max(0, start);
      });
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && open && activeIndex >= 0) {
      event.preventDefault();
      selectOption(options[activeIndex]);
    }
  };

  return (
    <div className={`relative block ${className}`} ref={ref}>
      {label ? (
        <span
          id={labelId}
          className={`mb-1.5 block text-sm font-medium text-slate-600 ${labelClassName}`}
        >
          {label}
        </span>
      ) : null}
      <button
        type="button"
        id={buttonId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={label ? `${labelId} ${buttonId}` : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        title={title}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          setActiveIndex(getSelectedIndex());
          setOpen(true);
        }}
        className={`sampi-control flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100 ${buttonClassName}`}
      >
        <span>{selected?.label || "Tanlang"}</span>
        <svg
          className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          className={`animate-dropdown-pop sampi-dropdown absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ${menuClassName}`}
        >
          {options.map((option, index) => {
            const active = option.value === value;
            const focused = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={active}
                onClick={() => {
                  selectOption(option);
                }}
                className={`sampi-dropdown-item block w-full px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : focused
                      ? "bg-slate-100 text-slate-800"
                      : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default SelectMenu;
