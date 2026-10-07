import { useEffect, useState } from "react";
import { EmptyIllustration } from "./EmptyState.jsx";

const NEW_ROW_MS = 2400;

const getRowKey = (row, index) => row?._id || row?.id || index;

function Table({
  columns,
  data,
  headerClassName = "",
  rowClassName = "",
  cellClassName = "",
  tableClassName = "",
  emptyText = "Ma'lumot topilmadi",
  emptyHint = ""
}) {
  const resolveClassName = (value, ...args) =>
    typeof value === "function" ? value(...args) : value;
  const getColumnLabel = (label) => (typeof label === "string" ? label : "");

  // Yangi qo'shilgan qatorlar qisqa vaqt yonib turadi. Birinchi yuklanishda hech qaysi
  // qator "yangi" hisoblanmaydi (aks holda butun jadval yonib ketardi).
  const keys = data.map((row, index) => String(getRowKey(row, index)));
  const signature = keys.join("|");
  const [seen, setSeen] = useState(() => ({ signature, keys: new Set(keys), fresh: [] }));
  if (seen.signature !== signature) {
    const added = seen.keys.size ? keys.filter((key) => !seen.keys.has(key)) : [];
    // Ko'p qator birdan almashsa (sana/filtr o'zgardi) — bu yangi yozuv emas, yondirilmaydi.
    const fresh = added.length <= 3 ? added : [];
    setSeen({ signature, keys: new Set([...seen.keys, ...keys]), fresh });
  }

  useEffect(() => {
    if (!seen.fresh.length) return undefined;
    const timer = window.setTimeout(
      () => setSeen((prev) => ({ ...prev, fresh: [] })),
      NEW_ROW_MS
    );
    return () => window.clearTimeout(timer);
  }, [seen.fresh]);

  const freshKeys = new Set(seen.fresh);

  return (
    <div className="sampi-table-wrap sampi-dropdown w-full overflow-x-auto rounded-lg border border-slate-200">
      <table className={`sampi-data-table w-full table-auto bg-white text-sm ${tableClassName}`.trim()}>
        <thead className={`bg-slate-50 text-left text-slate-600 ${headerClassName}`.trim()}>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-slate-500 sm:px-4" colSpan={columns.length}>
                <div className="sx-empty mx-auto flex max-w-xs flex-col items-center gap-1.5">
                  <EmptyIllustration />
                  <span className="font-semibold text-slate-600">{emptyText}</span>
                  {emptyHint ? <span className="text-xs text-slate-400">{emptyHint}</span> : null}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => {
              const resolvedRowClassName = resolveClassName(rowClassName, row, rowIndex);
              const key = getRowKey(row, rowIndex);

              return (
                <tr
                  key={key}
                  className={`sampi-table-row border-t border-slate-100 transition-colors duration-200 hover:bg-slate-50/80 ${
                    freshKeys.has(String(key)) ? "sx-row-new" : ""
                  } ${resolvedRowClassName}`.trim()}
                >
                  {columns.map((col) => {
                    const resolvedCellClassName = resolveClassName(cellClassName, row, col, rowIndex);
                    return (
                      <td
                        key={col.key}
                        data-label={getColumnLabel(col.label)}
                        className={`px-3 py-3 align-top text-slate-700 sm:px-4 ${resolvedCellClassName}`.trim()}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
