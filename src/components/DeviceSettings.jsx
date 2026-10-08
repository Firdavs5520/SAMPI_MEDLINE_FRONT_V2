import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import SelectMenu from "./SelectMenu.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { AUTO_FULLSCREEN_PREF_KEY, FULLSCREEN_OFF_KEY } from "../utils/constants.js";
import { extractErrorMessage } from "../utils/format.js";

const APP_VERSION = __APP_VERSION__;

const THEME_OPTIONS = [
  { value: "light", label: "Yorug'" },
  { value: "dark", label: "Qorong'i" },
  { value: "system", label: "Tizim bo'yicha" }
];

const getDesktop = () => (typeof window !== "undefined" ? window.sampiDesktop || null : null);

const canUsePrinters = (desktop) =>
  typeof desktop?.listPrinters === "function" && typeof desktop?.setReceiptPrinter === "function";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Sinov cheki: chek printeri tanlangan printerga to'g'ri chiqishini tekshirish uchun.
const buildTestReceiptHtml = (printerName) => {
  const now = new Date().toLocaleString("uz-UZ");
  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Sinov cheki</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; width: 80mm; background: #fff; color: #000; font-family: Arial, sans-serif; }
      .ticket { box-sizing: border-box; width: 72mm; padding: 6px 2mm; text-align: center; }
      .title { font-size: 18px; font-weight: 900; }
      .divider { border-top: 2px dashed #000; margin: 8px 0; }
      .big { font-size: 22px; font-weight: 900; margin: 6px 0; }
      .text { font-size: 14px; margin: 3px 0; }
    </style>
  </head>
  <body>
    <div class="ticket" data-sampi-receipt="check">
      <div class="title">SAMPI MEDICINE</div>
      <div class="divider"></div>
      <div class="big">SINOV CHEKI</div>
      <div class="text">Printer: ${escapeHtml(printerName || "avtomatik")}</div>
      <div class="text">${escapeHtml(now)}</div>
      <div class="divider"></div>
      <div class="text">Printer to'g'ri ishlayapti</div>
    </div>
  </body>
</html>`;
};

const readAutoFullscreen = () => {
  try {
    return window.localStorage.getItem(AUTO_FULLSCREEN_PREF_KEY) !== "off";
  } catch {
    return true;
  }
};

function SettingCard({ title, description, children }) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({ checked, onChange, title, description, disabled = false }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-semibold text-slate-800">{title}</span>
        {description ? <span className="mt-0.5 block text-sm text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

// LOR, hamshira va kassa uchun umumiy qurilma sozlamalari: chek printeri, mavzu,
// to'liq ekran va ilova versiyasi. Sozlamalar shu kompyuterning o'zida saqlanadi.
function DeviceSettings() {
  const desktop = getDesktop();
  const { mode, setMode } = useTheme();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [printers, setPrinters] = useState({
    loading: false,
    saving: false,
    testing: false,
    list: [],
    selected: "",
    windowsDefault: "",
    fallback: "XP-80"
  });
  const [startFullscreen, setStartFullscreen] = useState(null);
  const [autoFullscreen, setAutoFullscreen] = useState(readAutoFullscreen);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement)
  );
  const [updateState, setUpdateState] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const showMessage = (text) => {
    setError("");
    setSuccess(text);
  };
  const showError = (err) => {
    setSuccess("");
    setError(extractErrorMessage(err));
  };

  const loadPrinters = useCallback(
    async ({ silent = false } = {}) => {
      if (!canUsePrinters(desktop)) return;
      if (!silent) setPrinters((prev) => ({ ...prev, loading: true }));
      try {
        const data = await desktop.listPrinters();
        setPrinters((prev) => ({
          ...prev,
          loading: false,
          list: data?.printers || [],
          selected: data?.selectedPrinterName || "",
          windowsDefault: data?.defaultPrinterName || "",
          fallback: data?.fallbackPrinterName || "XP-80"
        }));
      } catch (err) {
        setPrinters((prev) => ({ ...prev, loading: false }));
        showError(err);
      }
    },
    [desktop]
  );

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    if (typeof desktop?.getWindowSettings !== "function") return;
    desktop
      .getWindowSettings()
      .then((value) => setStartFullscreen(value?.startFullscreen !== false))
      .catch(() => {});
  }, [desktop]);

  // Hozirgi to'liq ekran holati: desktop'da Windows oynasi, saytda brauzer.
  useEffect(() => {
    if (typeof desktop?.toggleFullscreen === "function") {
      desktop
        .getWindowSettings?.()
        .then((value) => setIsFullscreen(Boolean(value?.isFullscreen)))
        .catch(() => {});
      return desktop.onFullscreenChange?.((value) => setIsFullscreen(Boolean(value)));
    }
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [desktop]);

  useEffect(() => {
    if (typeof desktop?.getUpdateState !== "function") return undefined;
    let active = true;
    desktop
      .getUpdateState()
      .then((value) => {
        if (active) setUpdateState(value);
      })
      .catch(() => {});
    const unsubscribe = desktop.onUpdateState?.((value) => setUpdateState(value));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [desktop]);

  const printerOptions = useMemo(
    () =>
      printers.list.map((printer) => ({
        value: printer.name,
        label: `${printer.displayName || printer.name}${printer.isDefault ? " (Windows asosiy)" : ""}`
      })),
    [printers.list]
  );

  const handlePrinterChange = async (printerName) => {
    if (!canUsePrinters(desktop) || printers.saving) return;
    setPrinters((prev) => ({ ...prev, saving: true, selected: printerName }));
    try {
      const saved = await desktop.setReceiptPrinter(printerName);
      setPrinters((prev) => ({ ...prev, saving: false, selected: saved?.printerName || printerName }));
      showMessage(`Chek printeri saqlandi: ${saved?.printerName || printerName}`);
    } catch (err) {
      setPrinters((prev) => ({ ...prev, saving: false }));
      showError(err);
      loadPrinters({ silent: true });
    }
  };

  const handleTestPrint = async () => {
    if (typeof desktop?.printReceiptHtml !== "function" || printers.testing) return;
    setPrinters((prev) => ({ ...prev, testing: true }));
    try {
      await desktop.printReceiptHtml(buildTestReceiptHtml(printers.selected || printers.fallback), {
        printerName: printers.selected || undefined
      });
      showMessage("Sinov cheki printerga yuborildi.");
    } catch (err) {
      showError(err);
    } finally {
      setPrinters((prev) => ({ ...prev, testing: false }));
    }
  };

  const handleStartFullscreen = async (enabled) => {
    if (typeof desktop?.setStartFullscreen !== "function") return;
    setStartFullscreen(enabled);
    try {
      const saved = await desktop.setStartFullscreen(enabled);
      setStartFullscreen(saved?.startFullscreen !== false);
      showMessage(enabled ? "Ilova endi doim to'liq ekranda ochiladi." : "To'liq ekranda ochilish o'chirildi.");
    } catch (err) {
      setStartFullscreen(!enabled);
      showError(err);
    }
  };

  const handleAutoFullscreen = (enabled) => {
    setAutoFullscreen(enabled);
    try {
      if (enabled) window.localStorage.removeItem(AUTO_FULLSCREEN_PREF_KEY);
      else window.localStorage.setItem(AUTO_FULLSCREEN_PREF_KEY, "off");
    } catch {
      // Brauzer xotirasi yopiq bo'lsa, sozlama shu sahifa yopilguncha amal qiladi.
    }
    if (!enabled && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    showMessage(enabled ? "Sayt bosilganda to'liq ekranga o'tadi." : "Avtomatik to'liq ekran o'chirildi.");
  };

  const handleToggleFullscreenNow = () => {
    if (typeof desktop?.toggleFullscreen === "function") {
      desktop
        .toggleFullscreen()
        .then((value) => setIsFullscreen(Boolean(value)))
        .catch(showError);
      return;
    }
    try {
      // Qo'lda chiqilgan bo'lsa, shu sessiyada keyingi bosishda avtomatik qayta yoqilmaydi.
      if (document.fullscreenElement) window.sessionStorage.setItem(FULLSCREEN_OFF_KEY, "1");
      else window.sessionStorage.removeItem(FULLSCREEN_OFF_KEY);
    } catch {
      // sessionStorage yopiq bo'lsa ham tugma ishlayveradi.
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
    }
  };

  const handleCheckUpdate = async () => {
    if (typeof desktop?.checkForUpdates !== "function") return;
    setCheckingUpdate(true);
    try {
      const state = await desktop.checkForUpdates();
      if (state && typeof state === "object") setUpdateState(state);
      showMessage(
        state?.status === "available" || state?.status === "downloading" || state?.status === "downloaded"
          ? `Yangi versiya bor: v${state.version}. Pastdagi oynadan o'rnating.`
          : "Ilova eng so'nggi versiyada."
      );
    } catch (err) {
      showError(err);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const isDesktop = Boolean(desktop);
  const browserFullscreenSupported =
    !isDesktop && typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const canToggleFullscreenNow = typeof desktop?.toggleFullscreen === "function" || browserFullscreenSupported;

  return (
    <div className="space-y-4">
      {canUsePrinters(desktop) ? (
        <SettingCard
          title="Chek printeri"
          description="Cheklar va navbat raqamlari shu printerga bitta bosishda chiqadi. Sozlama shu kompyuterda saqlanadi."
        >
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <SelectMenu
              label="Printer"
              value={printers.selected}
              options={printerOptions}
              onChange={handlePrinterChange}
              disabled={printers.loading || printers.saving || printerOptions.length === 0}
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full md:w-auto"
              loading={printers.loading}
              disabled={printers.saving}
              onClick={() => loadPrinters()}
            >
              Ro'yxatni yangilash
            </Button>
            <Button
              type="button"
              className="min-h-12 w-full md:w-auto"
              loading={printers.testing}
              loadingText="Yuborilmoqda..."
              disabled={printers.loading || printers.saving}
              onClick={handleTestPrint}
            >
              Sinov cheki
            </Button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-600">
            Hozirgi printer:{" "}
            <strong className="text-slate-800">{printers.selected || `${printers.fallback} (avtomatik)`}</strong>
            {printers.windowsDefault ? (
              <span className="ml-2 text-slate-500">Windows asosiy: {printers.windowsDefault}</span>
            ) : null}
          </div>
        </SettingCard>
      ) : (
        <SettingCard
          title="Chek printeri"
          description="Printerni tanlash va cheklarni bitta bosishda chiqarish faqat Sampi Medicine desktop ilovasida ishlaydi. Brauzerda chek brauzerning chop etish oynasi orqali chiqadi."
        />
      )}

      <SettingCard title="Ko'rinish" description="Ilova mavzusi shu kompyuterda saqlanadi.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mavzu">
          {THEME_OPTIONS.map((option) => {
            const active = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(option.value)}
                className={`min-h-12 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </SettingCard>

      {startFullscreen !== null || canToggleFullscreenNow ? (
        <SettingCard title="To'liq ekran">
          {canToggleFullscreenNow ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full sm:w-auto"
              onClick={handleToggleFullscreenNow}
            >
              {isFullscreen ? "Hozir to'liq ekrandan chiqish" : "Hozir to'liq ekranga o'tish"}
            </Button>
          ) : null}
          {startFullscreen !== null ? (
            <ToggleRow
              checked={startFullscreen}
              onChange={handleStartFullscreen}
              title="Ilova doim to'liq ekranda ochilsin"
              description="Desktop ilova har ochilganda butun ekranni egallaydi. Vaqtincha chiqish uchun yuqoridagi tugmani bosing."
            />
          ) : null}
          {browserFullscreenSupported ? (
            <ToggleRow
              checked={autoFullscreen}
              onChange={handleAutoFullscreen}
              title="Sayt avtomatik to'liq ekranga o'tsin"
              description="Sahifaga birinchi bosishda brauzer to'liq ekranga o'tadi. O'chirilsa, faqat yuqoridagi tugma bilan o'tiladi."
            />
          ) : null}
        </SettingCard>
      ) : null}

      <SettingCard title="Ilova haqida">
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            Sayt versiyasi: <strong className="text-slate-800">v{APP_VERSION}</strong>
          </div>
          {updateState?.currentVersion ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              Desktop ilova: <strong className="text-slate-800">v{updateState.currentVersion}</strong>
            </div>
          ) : null}
        </div>
        {typeof desktop?.checkForUpdates === "function" ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-12 w-full sm:w-auto"
            loading={checkingUpdate}
            loadingText="Tekshirilmoqda..."
            onClick={handleCheckUpdate}
          >
            Yangilanishni tekshirish
          </Button>
        ) : null}
      </SettingCard>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
    </div>
  );
}

export default DeviceSettings;
