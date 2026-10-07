// Bo'sh holat: chiziqli rasm (ochiq quti), sarlavha va ixtiyoriy yo'l-yo'riq.
export function EmptyIllustration() {
  return (
    <svg className="sx-empty-art" viewBox="0 0 120 90" aria-hidden="true">
      <ellipse cx="60" cy="80" rx="38" ry="5" className="sx-empty-shadow" />
      <path className="sx-empty-box" d="M24 38 L60 50 L96 38 L96 70 L60 82 L24 70 Z" />
      <path className="sx-empty-line" d="M60 50 L60 82" />
      <path className="sx-empty-flap" d="M24 38 L36 24 L72 36 L60 50 Z" />
      <path className="sx-empty-flap sx-empty-flap-right" d="M96 38 L84 24 L48 36 L60 50 Z" />
      <circle className="sx-empty-spark" cx="92" cy="16" r="2.5" />
      <circle className="sx-empty-spark sx-empty-spark-2" cx="28" cy="12" r="2" />
    </svg>
  );
}

function EmptyState({ title = "Ma'lumot topilmadi", hint = "", className = "" }) {
  return (
    <div className={`sx-empty mx-auto flex max-w-sm flex-col items-center gap-1.5 px-3 py-6 text-center ${className}`}>
      <EmptyIllustration />
      <span className="font-semibold text-slate-600">{title}</span>
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </div>
  );
}

export default EmptyState;
