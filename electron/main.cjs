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
    autoUpdater.quitAndInstall(false, true);
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

  return printers.find(matchesPreferred) || printers.find((printer) => printer.isDefault) || printers[0] || null;
};

const printHtmlSilently = async (parentWindow, html, options = {}) => {
  const printWindow = new BrowserWindow({
    width: 380,
    height: 700,
    show: false,
    parent: parentWindow || undefined,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));

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
    };
  } finally {
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
