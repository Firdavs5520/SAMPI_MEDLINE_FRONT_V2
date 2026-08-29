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
const THERMAL_SMALL_LINE_CHARS = 42;

const sanitizeThermalText = (value) =>
  transliterateThermalText(value)
    .replace(/[\u2018\u2019\u02bb]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
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

  if (isQueueTicket && !/data-sampi-receipt=["']check["']/i.test(source)) {
    return {
      type: "lor-queue",
      blocks: [
        { text: "SAMPI MEDLINE", align: "center", bold: true, size: "double" },
        { kind: "divider" },
        { text: "LOR", align: "center", bold: true },
        { kind: "divider" },
        { text: "Navbat raqami:", align: "center", bold: true },
        { text: queueCode, align: "center", bold: true, size: "double" },
        { kind: "divider" },
        { text: "Tashrifingiz uchun rahmat!", align: "center" },
      ],
    };
  }

  const blocks = [];
  const title = firstClassText(source, "check-title") || "SAMPI MEDLINE";
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
  const maxChars = size === "double" || size === "wide" ? Math.floor(lineChars / 2) : lineChars;
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
      const rawReceipt = await printReceiptAsRawText(
        printer.name,
        options.thermalReceipt || buildThermalReceiptFromHtml(safeHtml)
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
