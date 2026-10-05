const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { renderReceiptRaster, buildEscPosRasterPayload } = require("./receiptRaster.cjs");
const { inlineReceiptFonts } = require("./receiptFonts.cjs");
const { createRawPrintWorker, RawPrintWorkerUnavailableError } = require("./rawPrintWorker.cjs");

const APP_URL = process.env.SAMPI_DESKTOP_URL || "https://sampi-medline.vercel.app/";
const APP_ORIGIN = new URL(APP_URL).origin;
// Ikkala domen bitta saytga olib boradi (biri ikkinchisiga yo'naltiriladi).
const TRUSTED_ORIGINS = new Set([
  APP_ORIGIN,
  "https://sampi-medline.vercel.app",
  "https://sampi-medicine.vercel.app"
]);
// Chek printeriga chek saytdagi HTML ko'rinishida (o'sha dizayn) rasm qilib, ESC/POS
// buyruqlari bilan yuboriladi: qog'oz surish va kesishni drayver emas, ilova boshqaradi.
// SAMPI_RAW_RECEIPT=1 bo'lsa eski matnli ESC/POS, SAMPI_HTML_RECEIPT=1 bo'lsa drayver
// orqali HTML chop etish ishlatiladi.
const USE_RAW_RECEIPT_PRINT = process.env.SAMPI_RAW_RECEIPT === "1";
const USE_HTML_RECEIPT_PRINT = process.env.SAMPI_HTML_RECEIPT === "1";
const APP_ICON = path.join(__dirname, "../build/icon.ico");
const PRELOAD_SCRIPT = path.join(__dirname, "preload.cjs");
const RECEIPT_PRINTER_NAME = process.env.SAMPI_RECEIPT_PRINTER || "XP-80";
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
// Oyna qayta faollashganda ham tekshiradi, lekin tez-tez emas.
const UPDATE_FOCUS_CHECK_MIN_MS = 3 * 60 * 1000;
const UPDATE_SNOOZE_MS = 2 * 60 * 60 * 1000;
const PENDING_UPDATE_FILE = "pending-update.json";
const PRINT_JOB_TIMEOUT_MS = 20000;
const PRINT_WINDOW_CLOSE_DELAY_MS = 350;
// XPrinter 80mm qog'oz (bosiladigan kenglik 72mm, 576 nuqta).
const RECEIPT_WIDTH_MICRONS = 80000;
const MICRONS_PER_CSS_PIXEL = 25400 / 96;
const RECEIPT_HEIGHT_PADDING_MICRONS = 4000;
const RECEIPT_MIN_HEIGHT_MICRONS = 45000;
const RECEIPT_MAX_HEIGHT_MICRONS = 420000;
const RECEIPT_PRINTER_CONFIG_FILE = "receipt-printer.json";
const APP_SETTINGS_FILE = "app-settings.json";
const RAW_PRINT_TIMEOUT_MS = 20000;
// Printerlar ro'yxati har chekda Windows'dan qayta so'ralmaydi (printer topilmasa yangilanadi).
const PRINTER_LIST_CACHE_MS = 60 * 1000;
// SAMPI_NO_PRINT_WORKER=1 bo'lsa har chek uchun alohida PowerShell ishlatiladi (eski usul).
const USE_RAW_PRINT_WORKER = process.env.SAMPI_NO_PRINT_WORKER !== "1";
// Sinov uchun: Windows bo'lmagan kompyuterda ham chek rasmini oldindan tayyorlaydi.
const DEV_PRERENDER = process.env.SAMPI_DEV_PRERENDER === "1";

// Yangi versiya foydalanuvchi ruxsati bilan yuklanadi (ilovada so'rov va foiz ko'rsatiladi).
// Yuklangan, lekin o'rnatilmagan yangilanish ilova yopilganda o'rnatiladi.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

app.setAppUserModelId("uz.sampimedline.desktop");

// Ilova bitta nusxada ishlaydi: Windows'dan avtomatik ochilgandan keyin yorliq
// bosilsa, yangi oyna emas, mavjud oyna oldinga chiqadi.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  const [existingWindow] = BrowserWindow.getAllWindows().filter((win) => !win.getParentWindow());
  if (!existingWindow) return;
  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.show();
  existingWindow.focus();
});

// Windows'ga kirilganda ilova o'zi ochiladi (autozagruzka).
const enableAutoLaunch = () => {
  if (!app.isPackaged || process.platform !== "win32") return;
  try {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  } catch (error) {
    console.warn("Sampi Medicine auto-launch setup failed:", error.message);
  }
};

// SAMPI_DEV_UPDATES=1: o'rnatilmagan (dev) ilovada ham yangilanish oynasini sinash uchun
// dev-app-update.yml dagi manzildan tekshiradi.
const DEV_UPDATES = process.env.SAMPI_DEV_UPDATES === "1";
if (DEV_UPDATES) autoUpdater.forceDevUpdateConfig = true;

let lastUpdateCheckAt = 0;

const checkForAppUpdates = async () => {
  if (!app.isPackaged && !DEV_UPDATES) {
    return null;
  }

  lastUpdateCheckAt = Date.now();
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn("Sampi Medicine update check failed:", error.message);
    return null;
  }
};

// status: idle | available | downloading | downloaded | error
const updateState = {
  status: "idle",
  version: "",
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  error: "",
  size: 0,
  snoozedUntil: 0,
  // Oldingi ishga tushishda o'rnatilgan yangilanish: { from, to }.
  justUpdated: null,
};

const getPendingUpdatePath = () => path.join(app.getPath("userData"), PENDING_UPDATE_FILE);

// "Hozir o'rnatish" bosilganda qaysi versiyadan qaysiga o'tilayotgani yozib qo'yiladi,
// ilova qayta ochilganda "yangilandi" xabari shundan ko'rsatiladi.
const writePendingUpdate = async (from, to) => {
  try {
    await fs.writeFile(getPendingUpdatePath(), JSON.stringify({ from, to, at: Date.now() }), "utf8");
  } catch (error) {
    console.warn("Pending update note was not saved:", error.message);
  }
};

const readJustUpdated = async () => {
  try {
    const parsed = JSON.parse(await fs.readFile(getPendingUpdatePath(), "utf8"));
    await fs.unlink(getPendingUpdatePath()).catch(() => {});
    if (parsed?.to && parsed.to === app.getVersion()) {
      return { from: String(parsed.from || ""), to: String(parsed.to) };
    }
  } catch {
    // Fayl yo'q: oxirgi ishga tushishda yangilanish o'rnatilmagan.
  }
  return null;
};

const getPublicUpdateState = () => ({
  currentVersion: app.getVersion(),
  status: updateState.status,
  version: updateState.version,
  percent: updateState.percent,
  transferred: updateState.transferred,
  total: updateState.total,
  bytesPerSecond: updateState.bytesPerSecond,
  error: updateState.error,
  size: updateState.size,
  justUpdated: updateState.justUpdated,
  snoozed: updateState.status === "available" && Date.now() < updateState.snoozedUntil,
});

const broadcastUpdateState = () => {
  const state = getPublicUpdateState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send("sampi:update-state", state);
    if (state.status === "downloading") {
      window.setProgressBar(Math.max(0, Math.min(1, state.percent / 100)));
    } else {
      window.setProgressBar(-1);
    }
  }
};

const setUpdateState = (patch) => {
  Object.assign(updateState, patch);
  broadcastUpdateState();
};

autoUpdater.on("update-available", (info) => {
  if (updateState.status === "downloading" || updateState.status === "downloaded") return;
  const files = Array.isArray(info?.files) ? info.files : [];
  const size = files.reduce((max, file) => Math.max(max, Number(file?.size) || 0), 0);
  setUpdateState({ status: "available", version: String(info?.version || ""), size, error: "" });
});

autoUpdater.on("download-progress", (progress) => {
  setUpdateState({
    status: "downloading",
    percent: Math.round(Number(progress?.percent) || 0),
    transferred: Number(progress?.transferred) || 0,
    total: Number(progress?.total) || 0,
    bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
  });
});

autoUpdater.on("update-downloaded", (info) => {
  setUpdateState({
    status: "downloaded",
    version: String(info?.version || updateState.version),
    percent: 100,
    error: "",
  });
});

autoUpdater.on("error", (error) => {
  console.warn("Sampi Medicine updater error:", error.message);
  if (updateState.status === "downloading") {
    setUpdateState({ status: "error", error: error.message || "Yangilanishni yuklab bo'lmadi." });
  }
});

const assertTrustedSender = (event) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Update request came from an untrusted page.");
  }
};

ipcMain.handle("sampi:get-update-state", (event) => {
  assertTrustedSender(event);
  return getPublicUpdateState();
});

ipcMain.handle("sampi:download-update", (event) => {
  assertTrustedSender(event);
  if (!["available", "error"].includes(updateState.status)) {
    return getPublicUpdateState();
  }
  setUpdateState({ status: "downloading", percent: 0, transferred: 0, total: 0, error: "" });
  autoUpdater.downloadUpdate().catch((error) => {
    setUpdateState({ status: "error", error: error.message || "Yangilanishni yuklab bo'lmadi." });
  });
  return getPublicUpdateState();
});

ipcMain.handle("sampi:install-update", (event) => {
  assertTrustedSender(event);
  if (updateState.status !== "downloaded") {
    throw new Error("Yangilanish hali yuklanmagan.");
  }
  // Oynasiz o'rnatib, ilovani qayta ishga tushiradi.
  writePendingUpdate(app.getVersion(), updateState.version).finally(() => {
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
  return true;
});

ipcMain.handle("sampi:ack-update-notice", (event) => {
  assertTrustedSender(event);
  setUpdateState({ justUpdated: null });
  return getPublicUpdateState();
});

// "Yangilanishni tekshirish" tugmasi: "Keyinroq" bosilgan bo'lsa ham qayta ko'rsatadi.
ipcMain.handle("sampi:check-for-updates", async (event) => {
  assertTrustedSender(event);
  if (updateState.snoozedUntil) setUpdateState({ snoozedUntil: 0 });
  if (!["downloading", "downloaded"].includes(updateState.status)) {
    await checkForAppUpdates();
  }
  return getPublicUpdateState();
});

ipcMain.handle("sampi:snooze-update", (event) => {
  assertTrustedSender(event);
  setUpdateState({
    status: updateState.status === "error" ? "available" : updateState.status,
    snoozedUntil: Date.now() + UPDATE_SNOOZE_MS,
  });
  return getPublicUpdateState();
});

const normalizePrinterName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getReceiptPrinterConfigPath = () =>
  path.join(app.getPath("userData"), RECEIPT_PRINTER_CONFIG_FILE);

const readReceiptPrinterConfig = async () => {
  try {
    const raw = await fs.readFile(getReceiptPrinterConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      printerName: String(parsed?.printerName || "").trim()
    };
  } catch {
    return { printerName: "" };
  }
};

const writeReceiptPrinterConfig = async (config) => {
  const payload = {
    printerName: String(config?.printerName || "").trim()
  };
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getReceiptPrinterConfigPath(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
};

// Ilova oynasi sozlamalari. Standart: ilova doim to'liq ekranda ochiladi.
const DEFAULT_APP_SETTINGS = { startFullscreen: true };
const getAppSettingsPath = () => path.join(app.getPath("userData"), APP_SETTINGS_FILE);

const readAppSettingsSync = () => {
  try {
    const parsed = JSON.parse(require("node:fs").readFileSync(getAppSettingsPath(), "utf8"));
    return {
      startFullscreen:
        typeof parsed?.startFullscreen === "boolean"
          ? parsed.startFullscreen
          : DEFAULT_APP_SETTINGS.startFullscreen,
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
};

const writeAppSettings = async (settings) => {
  const payload = { ...readAppSettingsSync(), ...settings };
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getAppSettingsPath(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
};

const getMainWindow = () =>
  BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && !win.getParentWindow()) || null;

const isTrustedRendererUrl = (value) => {
  if (value === "about:blank") {
    return true;
  }

  try {
    return TRUSTED_ORIGINS.has(new URL(value).origin);
  } catch {
    return false;
  }
};

const listPrinters = async (webContents) => {
  const printers = await webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    description: printer.description || "",
    status: printer.status,
    isDefault: Boolean(printer.isDefault)
  }));
};

let printerListCache = { at: 0, printers: null };

const listPrintersCached = async (webContents, { fresh = false } = {}) => {
  if (!fresh && printerListCache.printers && Date.now() - printerListCache.at < PRINTER_LIST_CACHE_MS) {
    return printerListCache.printers;
  }
  const printers = await listPrinters(webContents);
  printerListCache = { at: Date.now(), printers };
  return printers;
};

const resolveReceiptPrinter = async (webContents, requestedPrinterName = "") => {
  try {
    return await findReceiptPrinter(await listPrintersCached(webContents), requestedPrinterName);
  } catch (error) {
    // Eski ro'yxatda topilmasa (printer yangi ulangan bo'lishi mumkin) Windows'dan qayta so'raladi.
    return findReceiptPrinter(await listPrintersCached(webContents, { fresh: true }), requestedPrinterName);
  }
};

const findReceiptPrinter = async (printers, requestedPrinterName = "") => {
  const savedConfig = await readReceiptPrinterConfig();
  const configuredName =
    String(requestedPrinterName || "").trim() ||
    savedConfig.printerName ||
    RECEIPT_PRINTER_NAME;
  const preferredName = normalizePrinterName(RECEIPT_PRINTER_NAME);
  const configuredPrinterName = normalizePrinterName(configuredName);
  const matchesPreferred = (printer) => {
    const names = [printer.name, printer.displayName].map(normalizePrinterName);
    return names.some(
      (name) =>
        name === configuredPrinterName ||
        name.includes(configuredPrinterName) ||
        (!savedConfig.printerName && (name === preferredName || name.includes(preferredName)))
    );
  };

  const preferredPrinter = printers.find(matchesPreferred);
  if (preferredPrinter) return preferredPrinter;

  // Printer tanlanmagan bo'lsa: nomi chek printeriga o'xshagani (XP-80C, POS Printer ...),
  // u ham bo'lmasa Windows'dagi standart printer.
  if (!requestedPrinterName && !savedConfig.printerName) {
    const thermalPrinter =
      printers.find(isLikelyThermalReceiptPrinter) || printers.find((printer) => printer.isDefault);
    if (thermalPrinter) return thermalPrinter;
  }

  const printerNames = printers
    .map((printer) => printer.displayName || printer.name)
    .filter(Boolean)
    .join(", ");
  throw new Error(
    `${configuredName} printer topilmadi.${printerNames ? ` Topilgan printerlar: ${printerNames}` : ""}`
  );
};

const stripExecutableReceiptContent = (html) =>
  String(html || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");

const extractReceiptText = (html) =>
  String(html || "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countMatches = (value, pattern) => String(value || "").match(pattern)?.length || 0;

const getFallbackReceiptMetrics = (html, error) => {
  const text = extractReceiptText(html);
  const isQueueTicket =
    /data-sampi-receipt=["']lor-queue["']/i.test(html) ||
    /Navbat raqami:/i.test(text);
  const rowCount = countMatches(html, /class=["'][^"']*\brow\b[^"']*["']/gi);
  const dividerCount = countMatches(html, /class=["'][^"']*\bdivider\b[^"']*["']/gi);
  const estimatedHeight = isQueueTicket
    ? 284
    : Math.max(220, 190 + rowCount * 22 + dividerCount * 8 + Math.ceil(text.length / 34) * 10);

  return {
    textLength: text.length,
    preview: text.slice(0, 120),
    width: 302,
    height: estimatedHeight,
    fallback: true,
    error: error?.message || String(error || "")
  };
};

const waitForReceiptLayout = async (webContents, html) => {
  const fallbackMetrics = getFallbackReceiptMetrics(html);

  try {
    return await webContents.executeJavaScript(
      `new Promise((resolve) => {
        const fallback = ${JSON.stringify(fallbackMetrics)};
        const done = () => {
          const body = document.body;
          const root = document.documentElement;
          const receipt = document.querySelector("[data-sampi-receipt]") || body;
          const rect = receipt ? receipt.getBoundingClientRect() : { width: 0, height: 0 };
          const text = String(body?.innerText || "").replace(/\\s+/g, " ").trim();
          resolve({
            ...fallback,
            textLength: text.length || fallback.textLength,
            preview: text.slice(0, 120) || fallback.preview,
            width: Math.ceil(Math.max(rect.width || 0, root?.scrollWidth || 0, fallback.width)),
            height: Math.ceil(Math.max(rect.height || 0, root?.scrollHeight || 0, body?.scrollHeight || 0, fallback.height)),
            fallback: false
          });
        };

        const waitForFonts = document.fonts?.ready
          ? Promise.race([
              document.fonts.ready,
              new Promise((resolveFontWait) => setTimeout(resolveFontWait, 1200))
            ])
          : Promise.resolve();

        waitForFonts.then(() => requestAnimationFrame(() => requestAnimationFrame(done)));
      })()`,
      true
    );
  } catch (error) {
    return getFallbackReceiptMetrics(html, error);
  }
};

const resolveReceiptPageSize = async (webContents, html) => {
  const metrics = await waitForReceiptLayout(webContents, html);
  if (!metrics.textLength || metrics.height < 24) {
    throw new Error(`Receipt rendered empty before print: ${JSON.stringify(metrics)}`);
  }

  return {
    width: RECEIPT_WIDTH_MICRONS,
    height: Math.min(
      RECEIPT_MAX_HEIGHT_MICRONS,
      Math.max(
        RECEIPT_MIN_HEIGHT_MICRONS,
        Math.ceil(metrics.height * MICRONS_PER_CSS_PIXEL) + RECEIPT_HEIGHT_PADDING_MICRONS
      )
    ),
    metrics,
  };
};

const isReceiptHtml = (html) =>
  /data-sampi-receipt=["'](?:check|lor-queue)["']/i.test(String(html || ""));

const isLikelyThermalReceiptPrinter = (printer) => {
  const haystack = normalizePrinterName(
    [printer?.name, printer?.displayName, printer?.description].filter(Boolean).join(" ")
  );
  return ["xp80", "xp58", "pos80", "pos58", "posprinter", "80mm", "xprinter", "thermal", "receipt"].some((token) => haystack.includes(token));
};

const shouldUseRawReceiptPrint = (printer, html, options = {}) =>
  USE_RAW_RECEIPT_PRINT &&
  process.platform === "win32" &&
  isReceiptHtml(html) &&
  !options.forceHtmlPrint &&
  isLikelyThermalReceiptPrinter(printer);

const shouldUseRasterReceiptPrint = (printer, html, options = {}) =>
  !USE_HTML_RECEIPT_PRINT &&
  process.platform === "win32" &&
  isReceiptHtml(html) &&
  !options.forceHtmlPrint &&
  isLikelyThermalReceiptPrinter(printer);

// 80mm printer: A shrift 48 ta, B shrift 64 ta belgi bir qatorga sig'adi.
const THERMAL_LINE_CHARS = 48;
const THERMAL_SMALL_LINE_CHARS = 64;

const sanitizeThermalText = (value) =>
  transliterateThermalText(value)
    .replace(/[\u2018\u2019\u02bb]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    // Narxdagi minglik ajratgich (uz-UZ da bo'linmas probel) printerda "?" bo'lib chiqmasin.
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");

const normalizeThermalText = (value) =>
  sanitizeThermalText(value)
    .replace(/[ \t]+/g, " ")
    .trim();

function transliterateThermalText(value) {
  const map = {
    Ё: "Yo",
    Й: "Y",
    Ц: "Ts",
    У: "U",
    К: "K",
    Е: "E",
    Н: "N",
    Г: "G",
    Ш: "Sh",
    Щ: "Sh",
    З: "Z",
    Х: "X",
    Ъ: "",
    Ф: "F",
    Ы: "I",
    В: "V",
    А: "A",
    П: "P",
    Р: "R",
    О: "O",
    Л: "L",
    Д: "D",
    Ж: "J",
    Э: "E",
    Я: "Ya",
    Ч: "Ch",
    С: "S",
    М: "M",
    И: "I",
    Т: "T",
    Ь: "",
    Б: "B",
    Ю: "Yu",
    ё: "yo",
    й: "y",
    ц: "ts",
    у: "u",
    к: "k",
    е: "e",
    н: "n",
    г: "g",
    ш: "sh",
    щ: "sh",
    з: "z",
    х: "x",
    ъ: "",
    ф: "f",
    ы: "i",
    в: "v",
    а: "a",
    п: "p",
    р: "r",
    о: "o",
    л: "l",
    д: "d",
    ж: "j",
    э: "e",
    я: "ya",
    ч: "ch",
    с: "s",
    м: "m",
    и: "i",
    т: "t",
    ь: "",
    б: "b",
    ю: "yu",
    Қ: "Q",
    қ: "q",
    Ғ: "G'",
    ғ: "g'",
    Ҳ: "H",
    ҳ: "h",
    Ў: "O'",
    ў: "o'",
  };

  return String(value ?? "")
    .replace(/Oʻ/g, "O'")
    .replace(/oʻ/g, "o'")
    .replace(/Gʻ/g, "G'")
    .replace(/gʻ/g, "g'")
    .replace(/[ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮёйцукенгшщзхъфывапролджэячсмитьбюҚқҒғҲҳЎў]/g, (char) => map[char] ?? char);
}

const wrapThermalText = (value, maxChars = THERMAL_LINE_CHARS) => {
  const text = normalizeThermalText(value);
  if (!text) return [""];

  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const alignThermalTextLine = (line, align = "left", maxChars = THERMAL_LINE_CHARS) => {
  const safeLine = normalizeThermalText(line).slice(0, maxChars);
  const remaining = Math.max(0, maxChars - safeLine.length);

  if (align === "center") {
    const left = Math.floor(remaining / 2);
    return `${" ".repeat(left)}${safeLine}`;
  }

  if (align === "right") {
    return `${" ".repeat(remaining)}${safeLine}`;
  }

  return safeLine;
};

const alignCommand = (align = "left") => {
  const normalized = String(align || "left").toLowerCase();
  if (normalized === "center") return Buffer.from([0x1b, 0x61, 0x01]);
  if (normalized === "right") return Buffer.from([0x1b, 0x61, 0x02]);
  return Buffer.from([0x1b, 0x61, 0x00]);
};

const fontCommand = (font = "normal") =>
  Buffer.from([0x1b, 0x4d, font === "small" ? 0x01 : 0x00]);

const sizeCommand = (size = "normal") => {
  switch (size) {
    case "double":
      return Buffer.from([0x1d, 0x21, 0x11]);
    case "huge":
      return Buffer.from([0x1d, 0x21, 0x33]);
    case "large":
      return Buffer.from([0x1d, 0x21, 0x22]);
    case "wide":
      return Buffer.from([0x1d, 0x21, 0x10]);
    case "tall":
      return Buffer.from([0x1d, 0x21, 0x01]);
    default:
      return Buffer.from([0x1d, 0x21, 0x00]);
  }
};

const boldCommand = (enabled) => Buffer.from([0x1b, 0x45, enabled ? 0x01 : 0x00]);

const textBuffer = (value) => Buffer.from(`${sanitizeThermalText(value)}\n`, "ascii");

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)));

const htmlToPlainText = (value) =>
  decodeHtmlEntities(
    String(value || "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|section|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

const firstClassText = (html, className) => {
  const pattern = new RegExp(
    `<([a-z0-9]+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i"
  );
  const match = String(html || "").match(pattern);
  return match ? htmlToPlainText(match[2]) : "";
};

const allClassText = (html, className) => {
  const pattern = new RegExp(
    `<([a-z0-9]+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "gi"
  );
  return Array.from(String(html || "").matchAll(pattern))
    .map((match) => htmlToPlainText(match[2]))
    .filter(Boolean);
};

const extractHtmlRows = (html) => {
  const rowPattern =
    /<div[^>]*class=["'][^"']*\brow\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi;
  return Array.from(String(html || "").matchAll(rowPattern)).map((match) => ({
    kind: "row",
    left: htmlToPlainText(match[1]),
    right: htmlToPlainText(match[2]),
    font: "small",
  }));
};

const buildThermalReceiptFromHtml = (html) => {
  const source = String(html || "");
  const isQueueTicket =
    /data-sampi-receipt=["']lor-queue["']/i.test(source) || /Navbat raqami:/i.test(source);
  const queueCode = firstClassText(source, "number") || htmlToPlainText(source).match(/\b\d{1,4}\b/)?.[0] || "00";
  const queueSmallLines = allClassText(source, "small");
  const lorLabel = queueSmallLines.find((line) => /^LOR(?:-\d+)?$/i.test(line)) || "LOR-1";

  if (isQueueTicket && !/data-sampi-receipt=["']check["']/i.test(source)) {
    return {
      type: "lor-queue",
      blocks: [
        { text: "SAMPI MEDICINE", align: "center", bold: true, size: "double" },
        { kind: "divider" },
        { text: lorLabel, align: "center", bold: true, size: "double" },
        { kind: "divider" },
        { text: "Navbat raqami:", align: "center", bold: true, size: "double" },
        { kind: "divider" },
        { text: queueCode, align: "center", bold: true, size: "large" },
        { kind: "divider" },
        { text: "Tashrifingiz uchun rahmat!", align: "center", bold: true },
        { kind: "divider" },
      ],
    };
  }

  const blocks = [];
  const title = firstClassText(source, "check-title") || "SAMPI MEDICINE";
  blocks.push({ text: title, align: "center", bold: true, size: "double" });
  blocks.push({ kind: "divider" });

  for (const line of allClassText(source, "text")) {
    blocks.push({ text: line, align: "center" });
  }

  const queueLine = firstClassText(source, "queue-line");
  if (queueLine) {
    blocks.push({ text: queueLine, align: "center", bold: true, size: "double" });
  }

  const sections = allClassText(source, "section-title");
  if (sections.length) {
    blocks.push({ kind: "divider" });
    sections.forEach((section) => blocks.push({ text: section, align: "center", bold: true }));
  }

  const rows = extractHtmlRows(source);
  rows.forEach((row) => blocks.push(row));

  const jami = firstClassText(source, "jami");
  if (jami) {
    const totalMatch = jami.match(/(.+?:)\s*(.+)$/);
    blocks.push({ kind: "divider" });
    blocks.push({
      kind: "row",
      left: totalMatch?.[1] || "Jami:",
      right: totalMatch?.[2] || jami.replace(/^Jami:\s*/i, ""),
      bold: true,
    });
  }

  const specialist = firstClassText(source, "nurse-line");
  if (specialist) {
    blocks.push({ kind: "divider" });
    blocks.push({ text: specialist, align: "center", bold: true });
  }

  const footer = firstClassText(source, "footer") || "Doimo sog'-salomat bo'ling";
  blocks.push({ text: footer, align: "center" });

  if (blocks.length <= 3) {
    htmlToPlainText(source)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => blocks.push({ text: line, align: "center" }));
  }

  return { type: "check", blocks };
};

const appendThermalLine = (buffers, block = {}) => {
  const size = block.size || "normal";
  const lineChars = block.font === "small" ? THERMAL_SMALL_LINE_CHARS : THERMAL_LINE_CHARS;
  const maxChars =
    size === "huge"
      ? Math.floor(lineChars / 4)
      : size === "large"
        ? Math.floor(lineChars / 3)
      : size === "double" || size === "wide"
        ? Math.floor(lineChars / 2)
        : lineChars;
  const lines = wrapThermalText(block.text, maxChars);

  buffers.push(alignCommand("left"));
  buffers.push(fontCommand(block.font));
  buffers.push(sizeCommand(size));
  buffers.push(boldCommand(Boolean(block.bold)));
  for (const line of lines) {
    buffers.push(textBuffer(alignThermalTextLine(line, block.align, maxChars)));
  }
  buffers.push(boldCommand(false));
  buffers.push(sizeCommand("normal"));
  buffers.push(fontCommand("normal"));
  buffers.push(alignCommand("left"));
};

const formatThermalRow = (left, right, lineChars = THERMAL_LINE_CHARS) => {
  const safeRight = normalizeThermalText(right).slice(0, lineChars);
  const availableLeft = Math.max(8, lineChars - safeRight.length - 1);
  const leftLines = wrapThermalText(left, availableLeft);
  const lines = [];

  leftLines.forEach((line, index) => {
    if (index === 0) {
      const spacing = Math.max(1, lineChars - line.length - safeRight.length);
      lines.push(`${line}${" ".repeat(spacing)}${safeRight}`);
    } else {
      lines.push(line);
    }
  });

  return lines;
};

const appendThermalRow = (buffers, block = {}) => {
  const lineChars = block.font === "small" ? THERMAL_SMALL_LINE_CHARS : THERMAL_LINE_CHARS;
  buffers.push(alignCommand("left"));
  buffers.push(fontCommand(block.font));
  buffers.push(sizeCommand("normal"));
  buffers.push(boldCommand(Boolean(block.bold)));
  for (const line of formatThermalRow(block.left, block.right, lineChars)) {
    buffers.push(textBuffer(line));
  }
  buffers.push(boldCommand(false));
  buffers.push(fontCommand("normal"));
};

const appendThermalDivider = (buffers) => {
  buffers.push(alignCommand("left"));
  buffers.push(textBuffer("-".repeat(THERMAL_LINE_CHARS)));
};

const buildEscPosTextPayload = (receipt = {}) => {
  const blocks = Array.isArray(receipt.blocks) ? receipt.blocks : [];
  if (!blocks.length) {
    throw new Error("RAW text chek ma'lumoti bo'sh.");
  }

  const buffers = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x74, 0x00]),
    fontCommand("normal"),
    Buffer.from([0x1b, 0x32]),
  ];

  for (const block of blocks) {
    if (block?.kind === "divider") {
      appendThermalDivider(buffers);
    } else if (block?.kind === "row") {
      appendThermalRow(buffers, block);
    } else if (block?.kind === "feed") {
      const count = Math.min(6, Math.max(1, Number(block.lines) || 1));
      buffers.push(Buffer.from("\n".repeat(count), "ascii"));
    } else {
      appendThermalLine(buffers, block);
    }
  }

  // Pastda ~10mm bo'sh joy qoldirib, avto-kesgich qisman kesadi (GS V 66 n).
  buffers.push(Buffer.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x30]));
  return Buffer.concat(buffers);
};

const getPowerShellPath = () =>
  path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );

const encodePowerShellArg = (value) => Buffer.from(String(value || ""), "utf8").toString("base64");

// Printerga RAW (ESC/POS) yuborish. Funksiyalar bitta joyda: bir martalik skript ham,
// doim ochiq turadigan tezkor "worker" ham shulardan foydalanadi.
const RAW_PRINT_POWERSHELL_PRELUDE = `
$ProgressPreference = "SilentlyContinue"
$source = @"
using System;
using System.Runtime.InteropServices;

public class SampiRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);
}
"@

function ThrowLastPrinterError([string]$message) {
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $detail = (New-Object ComponentModel.Win32Exception($code)).Message
  throw "$message ($code): $detail"
}

function Get-SampiPrinterSnapshot {
  try {
    $escapedName = $printerName.Replace("'", "''")
    return Get-CimInstance Win32_Printer -Filter "Name='$escapedName'" -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-SampiPrintJobs {
  try {
    return @(Get-PrintJob -PrinterName $printerName -ErrorAction Stop | Where-Object { $_.DocumentName -eq $jobName })
  } catch {
    return @()
  }
}

function Test-SampiBadPrinterState($snapshot) {
  if ($null -eq $snapshot) {
    return $false
  }

  if ($snapshot.WorkOffline) {
    return $true
  }

  if ([string]$snapshot.Status -eq "Error") {
    return $true
  }

  if (($snapshot.PrinterState -as [int]) -ne 0) {
    return $true
  }

  $detected = $snapshot.DetectedErrorState -as [int]
  return $detected -gt 0 -and $detected -ne 2
}

function Get-SampiPrinterStatusText($snapshot, $jobs) {
  $status = if ($null -eq $snapshot) { "topilmadi" } else { [string]$snapshot.Status }
  $offline = if ($null -eq $snapshot) { "unknown" } else { [string]$snapshot.WorkOffline }
  $state = if ($null -eq $snapshot) { "unknown" } else { [string]$snapshot.PrinterState }
  $detected = if ($null -eq $snapshot) { "unknown" } else { [string]$snapshot.DetectedErrorState }
  $jobStatus = ($jobs | ForEach-Object { [string]$_.JobStatus }) -join ", "
  if ([string]::IsNullOrWhiteSpace($jobStatus)) {
    $jobStatus = "yo'q"
  }
  return "Status=$status; WorkOffline=$offline; PrinterState=$state; DetectedErrorState=$detected; JobStatus=$jobStatus"
}

if (-not ("SampiRawPrinter" -as [type])) {
  Add-Type -TypeDefinition $source
}

function Invoke-SampiRawPrint([string]$printerName, [string]$dataPath, [string]$jobName, [string]$sentMarker = "") {
  $data = [IO.File]::ReadAllBytes($dataPath)
  $hPrinter = [IntPtr]::Zero

  # Printer holati chek yuborilgandan KEYIN tekshiriladi: Windows'dan holat so'rash
  # (~0.5-1 s) qog'oz chiqishini kechiktirmasin. Xato bo'lsa vazifa o'chiriladi va xato qaytadi.
  if (-not [SampiRawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
    ThrowLastPrinterError "Printer ochilmadi"
  }

  $doc = New-Object SampiRawPrinter+DOCINFOA
  $doc.pDocName = $jobName
  $doc.pDataType = "RAW"

  try {
    if (-not [SampiRawPrinter]::StartDocPrinter($hPrinter, 1, $doc)) {
      ThrowLastPrinterError "Print vazifasi boshlanmadi"
    }

    try {
      if (-not [SampiRawPrinter]::StartPagePrinter($hPrinter)) {
        ThrowLastPrinterError "Print sahifasi boshlanmadi"
      }

      try {
        [int]$written = 0
        if (-not [SampiRawPrinter]::WritePrinter($hPrinter, $data, $data.Length, [ref]$written)) {
          ThrowLastPrinterError "Printerga ma'lumot yozilmadi"
        }
        if ($written -ne $data.Length) {
          throw "Printerga ma'lumot to'liq yozilmadi: $written / $($data.Length)"
        }
      } finally {
        [void][SampiRawPrinter]::EndPagePrinter($hPrinter)
      }
    } finally {
      [void][SampiRawPrinter]::EndDocPrinter($hPrinter)
    }
  } finally {
    if ($hPrinter -ne [IntPtr]::Zero) {
      [void][SampiRawPrinter]::ClosePrinter($hPrinter)
    }
  }

  if ($sentMarker) {
    [Console]::Out.WriteLine($sentMarker)
    [Console]::Out.Flush()
  }

  # Windows printerni "offline" deb belgilab qo'ygan bo'lsa, yoqiladi: navbatdagi chek chiqadi.
  $snapshot = Get-SampiPrinterSnapshot
  if ($null -ne $snapshot -and $snapshot.WorkOffline) {
    try {
      $snapshot.WorkOffline = $false
      Set-CimInstance -InputObject $snapshot -ErrorAction Stop | Out-Null
    } catch {
    }
  }

  Start-Sleep -Milliseconds 800
  $snapshot = Get-SampiPrinterSnapshot
  $jobs = Get-SampiPrintJobs
  $failedJobs = @($jobs | Where-Object { [string]$_.JobStatus -match "Error|Retained|Offline|Blocked|Paper|Paused" })
  if ((Test-SampiBadPrinterState $snapshot) -or $failedJobs.Count -gt 0) {
    try {
      $jobs | Remove-PrintJob -ErrorAction SilentlyContinue
    } catch {
    }
    throw ("Chek printeri chekni chiqara olmadi. " + (Get-SampiPrinterStatusText $snapshot $jobs))
  }
}
`;

const RAW_PRINT_POWERSHELL_SCRIPT = `
param(
  [Parameter(Mandatory=$true)][string]$PrinterNameBase64,
  [Parameter(Mandatory=$true)][string]$DataPathBase64,
  [Parameter(Mandatory=$true)][string]$JobNameBase64
)

$printerName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PrinterNameBase64))
$dataPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($DataPathBase64))
$jobName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($JobNameBase64))

`
  + RAW_PRINT_POWERSHELL_PRELUDE
  + `
Invoke-SampiRawPrint $printerName $dataPath $jobName
`;

// Worker: PowerShell bir marta ishga tushadi va printer kodi bir marta kompilyatsiya qilinadi.
// Har chekda yangi PowerShell ochish (~1-2 soniya) shu bilan yo'qoladi.
const RAW_PRINT_WORKER_SCRIPT = RAW_PRINT_POWERSHELL_PRELUDE + `
[Console]::Out.WriteLine("SAMPI-READY")
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if (-not $line) { continue }
  $parts = $line.Split(" ")
  $id = $parts[0]
  try {
    $workerPrinter = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))
    $workerData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2]))
    $workerJob = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[3]))
    Invoke-SampiRawPrint $workerPrinter $workerData $workerJob "SAMPI-SENT $id"
    [Console]::Out.WriteLine("SAMPI-DONE $id OK")
  } catch {
    $message = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.Exception.Message))
    [Console]::Out.WriteLine("SAMPI-DONE $id ERR $message")
  }
  [Console]::Out.Flush()
}
`;

const runRawPrinterScriptOnce = async (printerName, dataPath, jobName) => {
  const tempDir = path.dirname(dataPath);
  const scriptPath = path.join(tempDir, `${path.basename(dataPath, ".bin")}.ps1`);
  await fs.writeFile(scriptPath, RAW_PRINT_POWERSHELL_SCRIPT, "utf8");

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        getPowerShellPath(),
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          encodePowerShellArg(printerName),
          encodePowerShellArg(dataPath),
          encodePowerShellArg(jobName),
        ],
        { windowsHide: true }
      );
      let stderr = "";
      let stdout = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("RAW printer vazifasi vaqtida tugamadi."));
      }, RAW_PRINT_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error((stderr || stdout || `PowerShell printer script failed with ${code}`).trim()));
      });
    });

    return { jobName };
  } finally {
    await fs.unlink(scriptPath).catch(() => {});
  }
};

let rawPrintWorker = null;

const getRawPrintTempDir = () => path.join(app.getPath("temp"), "sampi-medline-print");

const getRawPrintWorker = () => {
  if (!USE_RAW_PRINT_WORKER || process.platform !== "win32") return null;
  if (!rawPrintWorker) {
    rawPrintWorker = createRawPrintWorker({
      powershellPath: getPowerShellPath(),
      scriptText: RAW_PRINT_WORKER_SCRIPT,
      tempDir: getRawPrintTempDir(),
      jobTimeoutMs: RAW_PRINT_TIMEOUT_MS,
    });
  }
  return rawPrintWorker;
};

const runRawPrinterScript = async (printerName, data) => {
  const tempDir = getRawPrintTempDir();
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dataPath = path.join(tempDir, `${nonce}.bin`);
  const jobName = `Sampi Medicine receipt ${nonce}`;

  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(dataPath, data);

  try {
    const worker = getRawPrintWorker();
    if (worker) {
      try {
        const result = await worker.run(printerName, dataPath, jobName);
        return { jobName, sentAt: result?.sentAt || 0 };
      } catch (error) {
        // Faqat chek printerga hali yuborilmagan bo'lsa eski usul bilan qayta urinadi
        // (aks holda chek ikki marta chiqib qolishi mumkin).
        if (!(error instanceof RawPrintWorkerUnavailableError)) throw error;
        console.warn("Raw print worker unavailable, using one-shot PowerShell:", error.message);
      }
    }
    return await runRawPrinterScriptOnce(printerName, dataPath, jobName);
  } finally {
    await fs.unlink(dataPath).catch(() => {});
  }
};

const printReceiptAsRawText = async (printerName, receipt) => {
  const payload = buildEscPosTextPayload(receipt);
  const job = await runRawPrinterScript(printerName, payload);
  return {
    mode: "raw-text",
    width: THERMAL_LINE_CHARS,
    bytes: payload.length,
    jobName: job.jobName,
  };
};

const printReceiptAsRawRaster = async (printerName, raster) => {
  const payload = buildEscPosRasterPayload(raster);
  const job = await runRawPrinterScript(printerName, payload);
  return {
    mode: "raw-raster",
    width: raster.widthDots,
    height: raster.heightDots,
    bytes: payload.length,
    jobName: job.jobName,
    sentAt: job.sentAt || 0,
  };
};

// Chek rasmlari keshi: kassada keyingi navbat cheki Enter bosilishidan oldin tayyorlab
// qo'yiladi, shunda server javobidan keyin rasm darhol printerga ketadi.
const RASTER_CACHE_LIMIT = 4;
const rasterCache = new Map();

const getReceiptRaster = (safeHtml) => {
  const cached = rasterCache.get(safeHtml);
  if (cached) return { promise: cached, cached: true };
  const promise = renderReceiptRaster(safeHtml);
  rasterCache.set(safeHtml, promise);
  promise.catch(() => rasterCache.delete(safeHtml));
  while (rasterCache.size > RASTER_CACHE_LIMIT) {
    rasterCache.delete(rasterCache.keys().next().value);
  }
  return { promise, cached: false };
};

// Chekni rasm (ESC/POS) qilib yuborish uchun HTML faqat bir marta, yashirin oynada chiziladi.
// Rasm chiqmasa yoki printer chek printeri bo'lmasa, drayver orqali HTML chop etishga o'tadi.
const printHtmlSilently = async (parentWindow, html, options = {}) => {
  const startedAt = Date.now();
  const safeHtml = inlineReceiptFonts(stripExecutableReceiptContent(html));
  const printerSource =
    parentWindow && !parentWindow.isDestroyed() ? parentWindow.webContents : null;
  const printer = printerSource
    ? await resolveReceiptPrinter(printerSource, options.printerName)
    : null;
  const printerResolvedAt = Date.now();

  if (printer && shouldUseRawReceiptPrint(printer, safeHtml, options)) {
    const rawReceipt = await printReceiptAsRawText(
      printer.name,
      options.thermalReceipt || buildThermalReceiptFromHtml(safeHtml)
    );
    return { ok: true, printer: printer.name, ...rawReceipt };
  }

  if (printer && shouldUseRasterReceiptPrint(printer, safeHtml, options)) {
    let raster = null;
    let prerendered = false;
    try {
      const job = getReceiptRaster(safeHtml);
      prerendered = job.cached;
      raster = await job.promise;
    } catch (error) {
      // Rasm tayyorlanmasa, drayver orqali HTML chop etishga o'tiladi. Printerga yuborishdagi
      // xato esa qaytariladi (chek ikki marta chiqmasligi uchun).
      console.error("Receipt raster render failed, falling back to HTML print:", error);
    }

    if (raster) {
      const renderedAt = Date.now();
      const { sentAt, ...rasterReceipt } = await printReceiptAsRawRaster(printer.name, raster);
      const finishedAt = Date.now();
      return {
        ok: true,
        printer: printer.name,
        ...rasterReceipt,
        timings: {
          printerMs: printerResolvedAt - startedAt,
          renderMs: renderedAt - printerResolvedAt,
          // Chek Windows'ga topshirilguncha; undan keyingi holat tekshiruvi qog'ozni kechiktirmaydi.
          sendMs: (sentAt || finishedAt) - renderedAt,
          confirmMs: sentAt ? finishedAt - sentAt : 0,
          prerendered,
        },
      };
    }
  }

  return printHtmlWithDriver(parentWindow, safeHtml, options, printer);
};

const printHtmlWithDriver = async (parentWindow, safeHtml, options = {}, knownPrinter = null) => {
  const printWindow = new BrowserWindow({
    width: 340,
    height: 720,
    show: false,
    parent: parentWindow || undefined,
    webPreferences: {
      contextIsolation: true,
      javascript: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    const encodedHtml = Buffer.from(safeHtml, "utf8").toString("base64");
    await printWindow.loadURL(`data:text/html;charset=utf-8;base64,${encodedHtml}`);
    const receiptPageSize = await resolveReceiptPageSize(printWindow.webContents, safeHtml);

    const printer =
      knownPrinter || (await resolveReceiptPrinter(printWindow.webContents, options.printerName));
    if (!printer) {
      throw new Error("No printer is available for silent receipt printing.");
    }

    const printOptions = {
      silent: true,
      // Chrome'dagi kabi fon ranglari chop etilmaydi (termoprinterda kulrang nuqta bo'lmasin).
      printBackground: false,
      deviceName: printer.name,
      copies: Math.max(1, Number(options.copies) || 1),
      margins: {
        marginType: "none",
      },
      pageSize: {
        width: receiptPageSize.width,
        height: receiptPageSize.height,
      },
      landscape: false,
      scaleFactor: 100,
    };

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Silent receipt print timed out."));
      }, PRINT_JOB_TIMEOUT_MS);

      printWindow.webContents.print(printOptions, (success, failureReason) => {
        clearTimeout(timeout);
        if (success) {
          resolve();
          return;
        }

        reject(new Error(failureReason || "Silent receipt print failed."));
      });
    });

    return {
      ok: true,
      printer: printer.name,
      pageSize: receiptPageSize,
    };
  } finally {
    await new Promise((resolve) => setTimeout(resolve, PRINT_WINDOW_CLOSE_DELAY_MS));
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
};

ipcMain.handle("sampi:print-receipt-html", async (event, html, options = {}) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Receipt print request came from an untrusted page.");
  }

  if (typeof html !== "string" || html.trim().length < 20) {
    throw new Error("Receipt print HTML is empty.");
  }

  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  return printHtmlSilently(parentWindow, html, options);
});

ipcMain.handle("sampi:prerender-receipt-html", async (event, html) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Receipt prerender request came from an untrusted page.");
  }
  // Rasm faqat Windows'dagi chek printeri yo'lida ishlatiladi.
  if (process.platform !== "win32" && !DEV_PRERENDER) return { ok: false };
  if (typeof html !== "string" || !isReceiptHtml(html)) return { ok: false };
  try {
    await getReceiptRaster(inlineReceiptFonts(stripExecutableReceiptContent(html))).promise;
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("sampi:get-window-settings", (event) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Window settings request came from an untrusted page.");
  }
  const win = getMainWindow();
  return { ...readAppSettingsSync(), isFullscreen: Boolean(win?.isFullScreen()) };
});

ipcMain.handle("sampi:set-start-fullscreen", async (event, enabled) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Window settings request came from an untrusted page.");
  }
  const settings = await writeAppSettings({ startFullscreen: Boolean(enabled) });
  const win = getMainWindow();
  // Sozlama darhol qo'llanadi: yoqilsa hozir ham to'liq ekranga o'tadi.
  if (win && Boolean(enabled) !== win.isFullScreen()) win.setFullScreen(Boolean(enabled));
  return { ...settings, isFullscreen: Boolean(win?.isFullScreen()) };
});

ipcMain.handle("sampi:toggle-fullscreen", (event) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Window request came from an untrusted page.");
  }
  const win = getMainWindow();
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});

ipcMain.handle("sampi:list-printers", async (event) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Printer request came from an untrusted page.");
  }

  const printers = await listPrinters(event.sender);
  const config = await readReceiptPrinterConfig();
  const defaultPrinter = printers.find((printer) => printer.isDefault) || null;

  return {
    printers,
    selectedPrinterName: config.printerName,
    defaultPrinterName: defaultPrinter?.name || "",
    fallbackPrinterName: RECEIPT_PRINTER_NAME
  };
});

ipcMain.handle("sampi:set-receipt-printer", async (event, printerName) => {
  if (!isTrustedRendererUrl(event.senderFrame?.url || "")) {
    throw new Error("Printer setting request came from an untrusted page.");
  }

  const safePrinterName = String(printerName || "").trim();
  if (!safePrinterName) {
    return writeReceiptPrinterConfig({ printerName: "" });
  }

  const printers = await listPrinters(event.sender);
  const selected = printers.find((printer) =>
    [printer.name, printer.displayName].some((name) => name === safePrinterName)
  );
  if (!selected) {
    throw new Error(`${safePrinterName} printer topilmadi.`);
  }

  return writeReceiptPrinterConfig({ printerName: selected.name });
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    icon: APP_ICON,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nativeWindowOpen: true,
      nodeIntegration: false,
      preload: PRELOAD_SCRIPT,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.maximize();
  mainWindow.once("ready-to-show", () => {
    if (readAppSettingsSync().startFullscreen) {
      mainWindow.setFullScreen(true);
    }
    mainWindow.show();
  });

  const sendFullscreenState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sampi:fullscreen-changed", mainWindow.isFullScreen());
    }
  };
  mainWindow.on("enter-full-screen", sendFullscreenState);
  mainWindow.on("leave-full-screen", sendFullscreenState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          show: false,
          webPreferences: {
            contextIsolation: true,
            nativeWindowOpen: true,
            nodeIntegration: false,
            preload: PRELOAD_SCRIPT,
            sandbox: true,
            webSecurity: true,
          },
        },
      };
    }

    if (url.startsWith("about:")) {
      return { action: "deny" };
    }

    let targetOrigin = "";

    try {
      targetOrigin = new URL(url).origin;
    } catch {
      return { action: "deny" };
    }

    if (TRUSTED_ORIGINS.has(targetOrigin)) {
      return { action: "allow" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(APP_URL);
};

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  enableAutoLaunch();
  createWindow();
  // Birinchi chek ham tez chiqishi uchun printer worker ilova ochilganda tayyorlab qo'yiladi.
  setTimeout(() => getRawPrintWorker()?.warmUp(), 3000);
});

app.on("will-quit", () => {
  rawPrintWorker?.stop();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const justUpdated = await readJustUpdated();
  if (justUpdated) setUpdateState({ justUpdated });
  setTimeout(checkForAppUpdates, 5000);
  setInterval(checkForAppUpdates, UPDATE_CHECK_INTERVAL_MS);
  app.on("browser-window-focus", () => {
    if (Date.now() - lastUpdateCheckAt > UPDATE_FOCUS_CHECK_MIN_MS) checkForAppUpdates();
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
