const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
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
const RECEIPT_PRINTER_CONFIG_FILE = "receipt-printer.json";
const RAW_THERMAL_WIDTH_PX = 384;
const RAW_CAPTURE_MAX_HEIGHT_PX = 2400;
const RAW_PRINT_TIMEOUT_MS = 20000;

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

const resolveReceiptPrinter = async (webContents, requestedPrinterName = "") => {
  const printers = await listPrinters(webContents);
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
    width: 220,
    height: estimatedHeight,
    fallback: true,
    error: error?.message || String(error || "")
  };
};

const waitForReceiptLayout = async (_webContents, html) => getFallbackReceiptMetrics(html);

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
  return ["xp58", "xprinter", "thermal", "receipt"].some((token) => haystack.includes(token));
};

const shouldUseRawReceiptPrint = (printer, html, options = {}) =>
  process.platform === "win32" &&
  isReceiptHtml(html) &&
  !options.forceHtmlPrint &&
  isLikelyThermalReceiptPrinter(printer);

const THERMAL_LINE_CHARS = 32;

const normalizeThermalText = (value) =>
  String(value ?? "")
    .replace(/[\u2018\u2019\u02bb]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?")
    .replace(/[ \t]+/g, " ")
    .trim();

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

const alignCommand = (align = "left") => {
  const normalized = String(align || "left").toLowerCase();
  if (normalized === "center") return Buffer.from([0x1b, 0x61, 0x01]);
  if (normalized === "right") return Buffer.from([0x1b, 0x61, 0x02]);
  return Buffer.from([0x1b, 0x61, 0x00]);
};

const sizeCommand = (size = "normal") => {
  switch (size) {
    case "double":
      return Buffer.from([0x1d, 0x21, 0x11]);
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

const textBuffer = (value) => Buffer.from(`${normalizeThermalText(value)}\n`, "ascii");

const appendThermalLine = (buffers, block = {}) => {
  const size = block.size || "normal";
  const maxChars =
    size === "large" ? 10 : size === "double" ? 16 : size === "wide" ? 16 : THERMAL_LINE_CHARS;
  const lines = wrapThermalText(block.text, maxChars);

  buffers.push(alignCommand(block.align));
  buffers.push(sizeCommand(size));
  buffers.push(boldCommand(Boolean(block.bold)));
  for (const line of lines) {
    buffers.push(textBuffer(line));
  }
  buffers.push(boldCommand(false));
  buffers.push(sizeCommand("normal"));
  buffers.push(alignCommand("left"));
};

const formatThermalRow = (left, right) => {
  const safeRight = normalizeThermalText(right).slice(0, THERMAL_LINE_CHARS);
  const availableLeft = Math.max(8, THERMAL_LINE_CHARS - safeRight.length - 1);
  const leftLines = wrapThermalText(left, availableLeft);
  const lines = [];

  leftLines.forEach((line, index) => {
    if (index === 0) {
      const spacing = Math.max(1, THERMAL_LINE_CHARS - line.length - safeRight.length);
      lines.push(`${line}${" ".repeat(spacing)}${safeRight}`);
    } else {
      lines.push(line);
    }
  });

  return lines;
};

const appendThermalRow = (buffers, block = {}) => {
  buffers.push(alignCommand("left"));
  buffers.push(sizeCommand("normal"));
  buffers.push(boldCommand(Boolean(block.bold)));
  for (const line of formatThermalRow(block.left, block.right)) {
    buffers.push(textBuffer(line));
  }
  buffers.push(boldCommand(false));
};

const appendThermalDivider = (buffers) => {
  buffers.push(alignCommand("center"));
  buffers.push(textBuffer("-".repeat(THERMAL_LINE_CHARS)));
  buffers.push(alignCommand("left"));
};

const buildEscPosTextPayload = (receipt = {}) => {
  const blocks = Array.isArray(receipt.blocks) ? receipt.blocks : [];
  if (!blocks.length) {
    throw new Error("RAW text chek ma'lumoti bo'sh.");
  }

  const buffers = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x74, 0x00]),
    Buffer.from([0x1b, 0x33, 0x18]),
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

  buffers.push(Buffer.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]));
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

const RAW_PRINT_POWERSHELL_SCRIPT = `
param(
  [Parameter(Mandatory=$true)][string]$PrinterNameBase64,
  [Parameter(Mandatory=$true)][string]$DataPathBase64
)

$printerName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PrinterNameBase64))
$dataPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($DataPathBase64))

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

Add-Type -TypeDefinition $source
$data = [IO.File]::ReadAllBytes($dataPath)
$hPrinter = [IntPtr]::Zero

if (-not [SampiRawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
  ThrowLastPrinterError "Printer ochilmadi"
}

$doc = New-Object SampiRawPrinter+DOCINFOA
$doc.pDocName = "Sampi Medline receipt"
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
`;

const runRawPrinterScript = async (printerName, data) => {
  const tempDir = path.join(app.getPath("temp"), "sampi-medline-print");
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dataPath = path.join(tempDir, `${nonce}.bin`);
  const scriptPath = path.join(tempDir, `${nonce}.ps1`);

  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(dataPath, data);
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
  } finally {
    await Promise.allSettled([fs.unlink(dataPath), fs.unlink(scriptPath)]);
  }
};

const findContentBounds = (bitmap, width, height) => {
  const hasInkOnRow = (y) => {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      const alpha = bitmap[offset + 3];
      if (alpha > 16 && red * 0.299 + green * 0.587 + blue * 0.114 < 245) {
        return true;
      }
    }
    return false;
  };

  let top = 0;
  while (top < height && !hasInkOnRow(top)) top += 1;

  let bottom = height - 1;
  while (bottom >= top && !hasInkOnRow(bottom)) bottom -= 1;

  if (bottom < top) {
    throw new Error("Chek rasmi bo'sh chiqdi.");
  }

  return {
    top: Math.max(0, top - 8),
    bottom: Math.min(height - 1, bottom + 12),
  };
};

const buildEscPosRasterPayload = (image) => {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const bounds = findContentBounds(bitmap, width, height);
  const sourceHeight = bounds.bottom - bounds.top + 1;
  const targetWidth = RAW_THERMAL_WIDTH_PX;
  const targetHeight = Math.max(1, Math.ceil((sourceHeight * targetWidth) / width));
  const rowBytes = Math.ceil(targetWidth / 8);
  const raster = Buffer.alloc(rowBytes * targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = bounds.top + Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x * width) / targetWidth));
      const offset = (sourceY * width + sourceX) * 4;
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      const alpha = bitmap[offset + 3];
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      if (alpha > 16 && luminance < 205) {
        raster[y * rowBytes + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }

  const header = Buffer.from([
    0x1b,
    0x40,
    0x1b,
    0x61,
    0x01,
    0x1d,
    0x76,
    0x30,
    0x00,
    rowBytes & 0xff,
    (rowBytes >> 8) & 0xff,
    targetHeight & 0xff,
    (targetHeight >> 8) & 0xff,
  ]);
  const footer = Buffer.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);

  return Buffer.concat([header, raster, footer]);
};

const printReceiptAsRawRaster = async (printWindow, printerName, metrics) => {
  const captureHeight = Math.min(
    RAW_CAPTURE_MAX_HEIGHT_PX,
    Math.max(180, Math.ceil(Number(metrics?.height) || 0) + 24)
  );
  printWindow.setContentSize(260, captureHeight);
  await new Promise((resolve) => setTimeout(resolve, 160));
  const image = await printWindow.webContents.capturePage({
    x: 0,
    y: 0,
    width: 260,
    height: captureHeight,
  });
  const payload = buildEscPosRasterPayload(image);
  await runRawPrinterScript(printerName, payload);
  return {
    mode: "raw-raster",
    width: RAW_THERMAL_WIDTH_PX,
    bytes: payload.length,
  };
};

const printReceiptAsRawText = async (printerName, receipt) => {
  const payload = buildEscPosTextPayload(receipt);
  await runRawPrinterScript(printerName, payload);
  return {
    mode: "raw-text",
    width: THERMAL_LINE_CHARS,
    bytes: payload.length,
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

    const printer = await resolveReceiptPrinter(printWindow.webContents, options.printerName);
    if (!printer) {
      throw new Error("No printer is available for silent receipt printing.");
    }

    if (shouldUseRawReceiptPrint(printer, safeHtml, options)) {
      if (options.thermalReceipt) {
        const rawReceipt = await printReceiptAsRawText(printer.name, options.thermalReceipt);
        return {
          ok: true,
          printer: printer.name,
          pageSize: receiptPageSize,
          ...rawReceipt,
        };
      }

      const rawReceipt = await printReceiptAsRawRaster(
        printWindow,
        printer.name,
        receiptPageSize.metrics
      );
      return {
        ok: true,
        printer: printer.name,
        pageSize: receiptPageSize,
        ...rawReceipt,
      };
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
