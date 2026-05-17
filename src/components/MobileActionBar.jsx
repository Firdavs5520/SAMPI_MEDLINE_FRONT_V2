function MobileActionBar({ children, show = true }) {
  if (!show) return null;

  return (
    <div className="sampi-mobile-actions sm:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5">
        {children}
      </div>
    </div>
  );
}

export default MobileActionBar;
