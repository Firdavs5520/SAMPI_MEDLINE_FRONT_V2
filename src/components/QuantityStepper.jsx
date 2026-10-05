function QuantityStepper({ value, onChange, max = 99 }) {
  const quantity = Number(value) || 1;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Kamaytirish"
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
        className="h-7 w-7 rounded-md bg-slate-200 text-base font-bold text-slate-700 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-7 text-center text-sm font-bold">{quantity}</span>
      <button
        type="button"
        aria-label="Oshirish"
        disabled={quantity >= max}
        onClick={() => onChange(quantity + 1)}
        className="h-7 w-7 rounded-md bg-slate-200 text-base font-bold text-slate-700 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

export default QuantityStepper;
