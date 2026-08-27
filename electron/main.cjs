const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

const APP_URL = process.env.SAMPI_DESKTOP_URL || "https://sampi-medline.vercel.app/";
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_ICON = path.join(__dirname, "../build/icon.ico");
const PRELOAD_SCRIPT = path.join(__dirname, "preload.cjs");
const RECEIPT_PRINTER_NAME = process.env.SAMPI_RECEIPT_PRINTER || "XP-58";
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const AUTO_INSTALL_DELAY_MS = 5000;
const PRINT_JOB_TIMEOUT_MS = 20000;
const PRINT_WINDOW_CLOSE_DELAY_MS = 1500;
const RECEIPT_WIDTH_MICRONS = 58000;
const MICRONS_PER_CSS_PIXEL = 25400 / 96;
const RECEIPT_HEIGHT_PADDING_MICRONS = 4000;
const RECEIPT_MIN_HEIGHT_MICRONS = 45000;
const RECEIPT_MAX_HEIGHT_MICRONS = 420000;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

app.setAppUserModelId("uz.sampimedline.desktop");

const checkForAppUpdates = () => {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.checkForUpdates().catch((error) => {
    console.warn("Sampi Medline update check failed:", error.message);
  });
};

let updateInstallTimer = null;

autoUpdater.on("update-downloaded", () => {
  if (updateInstallTimer) {
    return;
  }

  updateInstallTimer = setTimeout(() => {
    autoUpdater.quitAndInstall(true, true);
  }, AUTO_INSTALL_DELAY_MS);
});

autoUpdater.on("error", (error) => {
  console.warn("Sampi Medline updater error:", error.message);
});

const normalizePrinterName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isTrustedRendererUrl = (value) => {
  if (value === "about:blank") {
    return true;
  }

  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch {
    return false;
  }
};

const resolveReceiptPrinter = async (webContents) => {
  const printers = await webContents.getPrintersAsync();
  const preferredName = normalizePrinterName(RECEIPT_PRINTER_NAME);
  const matchesPreferred = (printer) => {
    const names = [printer.name, printer.displayName].map(normalizePrinterName);
    return names.some((name) => name === preferredName || name.includes(preferredName));
  };

  const preferredPrinter = printers.find(matchesPreferred);
  if (preferredPrinter) return preferredPrinter;

  const printerNames = printers
    .map((printer) => printer.displayName || printer.name)
    .filter(Boolean)
    .join(", ");
  throw new Error(
    `${RECEIPT_PRINTER_NAME} printer topilmadi.${printerNames ? ` Topilgan printerlar: ${printerNames}` : ""}`
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
    width: 220,
    height: estimatedHeight,
    fallback: true,
    error: error?.message || String(error || "")
  };
};

const waitForReceiptLayout = async (webContents, html) => {
  const metrics = await webContents
    .executeJavaScript(
      `new Promise((resolve) => {
        const done = () => {
          try {
            const receipt =
              document.querySelector("[data-sampi-receipt]") ||
              document.querySelector(".ticket") ||
              document.querySelector(".check") ||
              document.body;
            const box = receipt.getBoundingClientRect();
            const bodyText = document.body ? document.body.innerText : "";
            const text = String(bodyText || "").trim();
            resolve({
              textLength: text.length,
              preview: text.slice(0, 120),
              width: Math.ceil(Math.max(box.width, receipt.scrollWidth, document.body.scrollWidth)),
              height: Math.ceil(Math.max(box.height, receipt.scrollHeight))
            });
          } catch (error) {
            resolve({
              textLength: 0,
              preview: "",
              width: 0,
              height: 0,
              error: error && error.message ? error.message : String(error)
            });
          }
        };

        const afterFonts = () => requestAnimationFrame(() => requestAnimationFrame(done));
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(afterFonts).catch(afterFonts);
        } else {
          afterFonts();
        }
      })()`,
      true
    )
    .catch((error) => getFallbackReceiptMetrics(html, error));

  if (metrics?.textLength && metrics.height >= 24) {
    return metrics;
  }

  return getFallbackReceiptMetrics(html, metrics?.error || "Receipt layout metrics were empty.");
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

const printHtmlSilently = async (parentWindow, html, options = {}) => {
  const printWindow = new BrowserWindow({
    width: 260,
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
    const safeHtml = stripExecutableReceiptContent(html);
    const encodedHtml = Buffer.from(safeHtml, "utf8").toString("base64");
    await printWindow.loadURL(`data:text/html;charset=utf-8;base64,${encodedHtml}`);
    const receiptPageSize = await resolveReceiptPageSize(printWindow.webContents, safeHtml);

    const printer = await resolveReceiptPrinter(printWindow.webContents);
    if (!printer) {
      throw new Error("No printer is available for silent receipt printing.");
    }

    const printOptions = {
      silent: true,
      printBackground: true,
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
    mainWindow.show();
  });

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

    if (targetOrigin === APP_ORIGIN) {
      return { action: "allow" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(APP_URL);
};

Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);

app.whenReady().then(() => {
  setTimeout(checkForAppUpdates, 15000);
  setInterval(checkForAppUpdates, UPDATE_CHECK_INTERVAL_MS);
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
