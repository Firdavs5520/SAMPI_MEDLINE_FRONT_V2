function Button({
  children,
  type = "button",
  loading = false,
  loadingText = "Yuklanmoqda...",
  disabled = false,
  variant = "primary",
  className = "",
  ...props
}) {
  const variants = {
    primary:
      "bg-primary text-white hover:bg-primary-dark focus:ring-primary/40 disabled:bg-slate-300",
    secondary:
      "bg-slate-200 text-slate-700 hover:bg-slate-300 focus:ring-slate-300 disabled:bg-slate-100",
    danger:
      "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-300 disabled:bg-rose-300",
    accent:
      "bg-accent text-white hover:bg-orange-600 focus:ring-orange-300 disabled:bg-orange-300"
  };

  return (
    <button
      type={type}
      disabled={loading || disabled}
      className={`sampi-btn inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="sampi-btn-spinner h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
