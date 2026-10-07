// page: butun sahifa yuklanayotganda sahifa shaklidagi "soya" bloklar (skeleton), ustidan
// nur o'tib turadi — sahifa tezroq ochilayotgandek tuyuladi. Oddiy holat (modal/kartochka
// ichida) ixcham nuqtalar.
function Spinner({ text = "Yuklanmoqda...", page = false }) {
  if (page) {
    return (
      <div className="sx-skeleton" role="status" aria-live="polite">
        <span className="sr-only">{text}</span>
        <div className="sx-skel-head">
          <span className="sx-skel sx-skel-title" />
          <span className="sx-skel sx-skel-sub" />
        </div>
        <div className="sx-skel-stats">
          {[0, 1, 2, 3].map((index) => (
            <div className="sx-skel-card" key={index} style={{ "--i": index }}>
              <span className="sx-skel sx-skel-line-sm" />
              <span className="sx-skel sx-skel-line-lg" />
            </div>
          ))}
        </div>
        <div className="sx-skel-card sx-skel-table">
          <span className="sx-skel sx-skel-line-md" />
          {[0, 1, 2, 3, 4].map((index) => (
            <span className="sx-skel sx-skel-row" key={index} style={{ "--i": index }} />
          ))}
        </div>
        <p className="sx-skel-label">
          <span className="sampi-loader-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {text.replace(/\.\.\.$/, "")}
        </p>
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
