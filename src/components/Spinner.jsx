function Spinner({ text = "Yuklanmoqda..." }) {
  return (
    <div className="sampi-alert flex items-center gap-3 text-slate-600">
      <span className="sampi-spin-dot h-5 w-5 rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

export default Spinner;
