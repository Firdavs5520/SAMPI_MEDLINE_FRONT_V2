// page: butun sahifa yuklanayotganda markazda brend belgisi, aylanuvchi halqa va
// sakrab turuvchi nuqtalar. Oddiy holat (modal/kartochka ichida) ixcham ko'rinish.
function Spinner({ text = "Yuklanmoqda...", page = false }) {
  if (page) {
    return (
      <div className="sampi-page-loader" role="status" aria-live="polite">
        <div className="sampi-page-loader-mark">
          <span className="sampi-page-loader-ring" aria-hidden="true" />
          <span className="sampi-page-loader-logo">SM</span>
        </div>
        <p className="sampi-page-loader-text">{text.replace(/\.\.\.$/, "")}</p>
        <span className="sampi-loader-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }

  return (
    <div className="sampi-alert flex items-center gap-3 text-slate-600" role="status">
      <span className="sampi-loader-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

export default Spinner;
