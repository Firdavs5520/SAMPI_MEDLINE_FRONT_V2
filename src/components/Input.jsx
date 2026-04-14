function Input({
  label,
  error,
  hint,
  required = false,
  className = "",
  inputRef = null,
  ...props
}) {
  const hasError = Boolean(error);

  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-600">
          {label}
          {required ? <span className="ml-1 text-rose-600">*</span> : null}
        </span>
      )}
      <input
        ref={inputRef}
        aria-invalid={hasError}
        className={`sampi-control w-full rounded-xl border bg-white px-3 py-2.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 sm:text-sm ${
          hasError
            ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-200"
            : "border-slate-300"
        } ${props.readOnly ? "bg-slate-50" : ""} ${className}`}
        {...props}
      />
      {hint && !hasError ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </label>
  );
}

export default Input;
