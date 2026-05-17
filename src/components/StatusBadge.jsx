function StatusBadge({ tone = "info", children, className = "" }) {
  const toneClass = {
    success: "sampi-status-success",
    warn: "sampi-status-warn",
    error: "sampi-status-error",
    info: "sampi-status-info",
    neutral: "bg-slate-100 text-slate-700"
  }[tone] || "sampi-status-info";

  return <span className={`sampi-status ${toneClass} ${className}`.trim()}>{children}</span>;
}

export default StatusBadge;
