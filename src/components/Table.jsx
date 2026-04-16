function Table({
  columns,
  data,
  headerClassName = "",
  rowClassName = "",
  cellClassName = "",
  tableClassName = "",
  containerClassName = "",
  stickyHeader = true,
  emptyTitle = "Ma'lumot topilmadi",
  emptyDescription = "",
  emptyActionLabel = "",
  onEmptyAction,
  mobileCard = true,
  mobileCardClassName = ""
}) {
  const visibilityClass = (column) => {
    if (column.hideOnMobile) return "hidden sm:table-cell";
    if (column.hideOnTablet) return "hidden lg:table-cell";
    return "";
  };

  const textAlignClass = (column) => {
    if (column.align === "right") return "text-right";
    if (column.align === "center") return "text-center";
    return "text-left";
  };
  const mobileAlignClass = (column) => {
    if (column.align === "left") return "text-left";
    if (column.align === "center") return "text-center";
    return "text-right";
  };

  const whiteSpaceClass = (column) => (column.nowrap === false ? "" : "whitespace-nowrap");
  const mobileColumns = columns.filter((column) => !column.hideOnMobile);

  return (
    <div className="space-y-3">
      {mobileCard ? (
        <div className={`space-y-2.5 sm:hidden ${mobileCardClassName}`.trim()}>
          {data.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-5 text-center text-slate-500">
              <div className="mx-auto max-w-xl">
                <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
                {emptyDescription ? <p className="mt-1 text-xs text-slate-500">{emptyDescription}</p> : null}
                {emptyActionLabel && onEmptyAction ? (
                  <button
                    type="button"
                    onClick={onEmptyAction}
                    className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {emptyActionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            data.map((row, rowIndex) => (
              <div
                key={row._id || row.id || rowIndex}
                className={`rounded-xl border border-slate-200 bg-white p-3 ${rowClassName}`.trim()}
              >
                <div className="space-y-2">
                  {mobileColumns.map((col) => (
                    <div key={col.key} className={`flex items-start justify-between gap-3 ${cellClassName}`.trim()}>
                      <span className="min-w-[96px] text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {col.label}
                      </span>
                      <div className={`flex-1 text-sm text-slate-700 ${mobileAlignClass(col)}`}>
                        {col.render ? col.render(row) : row[col.key]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      <div
        className={`sampi-dropdown w-full overflow-x-auto rounded-xl border border-slate-200 ${mobileCard ? "hidden sm:block" : ""} ${containerClassName}`.trim()}
      >
        <table className={`w-full min-w-[720px] table-auto bg-white text-sm ${tableClassName}`.trim()}>
          <thead
            className={`bg-slate-50 text-slate-600 ${
              stickyHeader ? "sticky top-0 z-[2] shadow-sm" : ""
            } ${headerClassName}`.trim()}
          >
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${whiteSpaceClass(col)} ${textAlignClass(col)} ${visibilityClass(col)} px-3 py-3 font-semibold sm:px-4 ${
                    col.thClassName || ""
                  }`.trim()}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-slate-500 sm:px-4"
                  colSpan={columns.length}
                >
                  <div className="mx-auto max-w-xl">
                    <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
                    {emptyDescription ? <p className="mt-1 text-xs text-slate-500">{emptyDescription}</p> : null}
                    {emptyActionLabel && onEmptyAction ? (
                      <button
                        type="button"
                        onClick={onEmptyAction}
                        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        {emptyActionLabel}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={row._id || row.id || rowIndex}
                  className={`sampi-table-row border-t border-slate-100 odd:bg-slate-50/35 transition-colors duration-200 hover:bg-slate-50/80 ${rowClassName}`.trim()}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${whiteSpaceClass(col)} ${textAlignClass(col)} ${visibilityClass(col)} px-3 py-3 align-top text-slate-700 sm:px-4 ${
                        col.tdClassName || ""
                      } ${cellClassName}`.trim()}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;
