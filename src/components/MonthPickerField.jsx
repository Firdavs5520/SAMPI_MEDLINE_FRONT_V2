import { useEffect, useMemo, useRef, useState } from "react";

const MONTH_LABELS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr"
];

const toMonthKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseMonthKey = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
};

const formatMonth = (value) => {
  const parsed = parseMonthKey(value);
  if (!parsed) return "";
  return `${MONTH_LABELS[parsed.month - 1]} ${parsed.year}`;
};

function MonthPickerField({ label, value, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = parseMonthKey(value) || parseMonthKey(toMonthKey()) || {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  };
  const [viewYear, setViewYear] = useState(selected.year);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const monthOptions = useMemo(
    () =>
      MONTH_LABELS.map((monthLabel, index) => ({
        label: monthLabel,
        value: `${viewYear}-${String(index + 1).padStart(2, "0")}`
      })),
    [viewYear]
  );

  return (
    <label className="relative block" ref={ref}>
      {label ? (
        <span className="sampi-field-label mb-1.5 block text-sm font-semibold text-slate-600">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setViewYear(selected.year);
          setOpen((prev) => !prev);
        }}
        className="sampi-input sampi-control flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-base font-bold text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        <span className="truncate">{formatMonth(value)}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
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
        <div className="animate-dropdown-pop sampi-dropdown absolute z-40 mt-1 w-[min(86vw,320px)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setViewYear((prev) => prev - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Oldin
            </button>
            <p className="text-sm font-black text-slate-900">{viewYear}</p>
            <button
              type="button"
              onClick={() => setViewYear((prev) => prev + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Keyin
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {monthOptions.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`min-h-10 rounded-lg px-2 text-sm font-bold transition ${
                    active
                      ? "bg-primary text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const currentMonth = toMonthKey();
              onChange(currentMonth);
              setViewYear(parseMonthKey(currentMonth)?.year || new Date().getFullYear());
              setOpen(false);
            }}
            className="mt-3 w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100"
          >
            Shu oy
          </button>
        </div>
      ) : null}
    </label>
  );
}

export default MonthPickerField;
