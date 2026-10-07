import { translateServiceName } from "./lorServiceNames.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const resolveItemType = (item, checkType) => {
  const fromItem = String(item?.itemType || "").toLowerCase();
  if (fromItem) return fromItem;
  const fromCheck = String(checkType || "").toLowerCase();
  if (fromCheck === "medicine" || fromCheck === "service") return fromCheck;
  return "";
};

const formatQueueCode = (value) => {
  const safe = String(value || "").replace(/\D/g, "");
  return safe ? safe.padStart(2, "0") : "";
};

const formatLorQueueTicketLabel = (ticket) => {
  const raw = String(ticket?.lorIdentity || ticket?.lor || "lor1")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (raw.includes("lor2")) return "LOR-2";
  return "LOR-1";
};

const buildCheckThermalReceipt = (check) => {
  const creatorRole = String(check?.createdBy?.role || "").toLowerCase();
  const lorQueueCode = formatQueueCode(check?.lorQueue?.queueCode || check?.queueCode);
  const blocks = [
    { text: "SAMPI MEDICINE", align: "center", bold: true, size: "double" },
    ...(creatorRole === "nurse" ? [{ text: "MUOLAJA XONASI", align: "center" }] : []),
    { kind: "divider" },
  ];

  if (creatorRole === "lor" && lorQueueCode) {
    blocks.push({ text: `NAVBAT ${lorQueueCode}`, align: "center", bold: true, size: "double" });
    blocks.push({ kind: "divider" });
  }

  blocks.push({ text: `Bemor: ${check?.patient?.fullName || "-"}` });
  blocks.push({
    text: `${creatorRole === "nurse" ? "Hamshira" : "Doktor"}: ${check?.createdBy?.name || "-"}`
  });
  blocks.push({ text: `Sana: ${formatReceiptDate(check?.createdAt)}` });
  blocks.push({ text: `Chek: ${shortCheckId(check?.checkId)}` });

  const appendItems = (title, itemType) => {
    const items = (check?.items || []).filter((item) => resolveItemType(item, check?.type) === itemType);
    if (!items.length) return;

    blocks.push({ kind: "divider" });
    blocks.push({ text: title, align: "center", bold: true });
    blocks.push({ kind: "divider" });

    items.forEach((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const lineTotal = unitPrice * quantity;
      blocks.push({ text: translateServiceName(item.name, "uz"), bold: true });
      blocks.push({
        kind: "row",
        // Bitta bo'lsa "1 x narx" yozilmaydi: narx o'ngda bir marta turadi.
        left: quantity > 1 ? (unitPrice > 0 ? `${quantity} x ${formatSum(unitPrice)}` : `${quantity} ta`) : "",
        right: lineTotal > 0 ? formatSum(lineTotal) : "Bepul",
        font: "small",
      });
    });
  };

  appendItems("DORILAR", "medicine");
  appendItems("XIZMATLAR", "service");

  blocks.push({ kind: "divider" });
  blocks.push({
    kind: "row",
    left: "JAMI",
    right: `${formatSum(check?.total)} so'm`,
    bold: true,
  });
  blocks.push({ kind: "divider" });

  blocks.push({ text: "Doimo sog'-salomat bo'ling!", align: "center", bold: true });
  blocks.push({ text: "Tashrifingiz uchun rahmat", align: "center" });
  return { type: "check", blocks };
};

const buildLorQueueThermalReceipt = (ticket) => {
  const queueCode = formatQueueCode(ticket?.queueCode);
  const lorLabel = formatLorQueueTicketLabel(ticket);
  return {
    type: "lor-queue",
    blocks: [
      { text: "SAMPI MEDICINE", align: "center", bold: true, size: "double" },
      { kind: "divider" },
      { text: lorLabel, align: "center", bold: true, size: "double" },
      { kind: "divider" },
      { text: "Navbat raqami:", align: "center", bold: true, size: "double" },
      { kind: "divider" },
      { text: queueCode || "00", align: "center", bold: true, size: "large" },
      { kind: "divider" },
      { text: "Tashrifingiz uchun rahmat!", align: "center", bold: true },
      { kind: "divider" },
    ],
  };
};

// Summa o'zbekcha uslubda: 330000 -> "330 000".
const formatSum = (value) => {
  const safe = Math.round(Number.isFinite(Number(value)) ? Number(value) : 0);
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

// Sana: "06.10.2026 20:03" (soniyasiz).
const formatReceiptDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

// "CHK-1791293232443-BB3D5F" -> "BB3D5F": chekda qisqa va o'qilishi oson.
const shortCheckId = (value) => {
  const parts = String(value || "").split("-").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "-";
};

// Har bir qator: nom alohida (to'liq), o'ngda qator summasi. "2 × 50 000" faqat bir
// xizmat/dori bir necha marta olinganda yoziladi; bitta bo'lsa narx bir marta turadi.
const buildItemRows = (items, itemType, checkType) => {
  return (items || [])
    .filter((item) => resolveItemType(item, checkType) === itemType)
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const lineTotal = unitPrice * quantity;
      const amount = lineTotal > 0 ? escapeHtml(formatSum(lineTotal)) : "Bepul";
      const name = escapeHtml(translateServiceName(item.name, "uz"));
      if (quantity <= 1) {
        return `<div class="item"><div class="item-line item-line-single"><span class="item-name">${name}</span><span class="item-amount">${amount}</span></div></div>`;
      }
      const detail =
        unitPrice > 0
          ? `${escapeHtml(quantity)} × ${escapeHtml(formatSum(unitPrice))}`
          : `${escapeHtml(quantity)} ta`;
      return `<div class="item"><div class="item-name">${name}</div><div class="item-line"><span class="item-detail">${detail}</span><span class="item-amount">${amount}</span></div></div>`;
    })
    .join("");
};

export const buildCheckPrintHtml = (check, options = {}) => {
  const { inline = false } = options;
  const medicineRows = buildItemRows(check.items, "medicine", check.type);
  const serviceRows = buildItemRows(check.items, "service", check.type);
  const section = (title, rows) =>
    rows ? `<div class="section-title"><span>${title}</span></div>${rows}` : "";

  const creatorRole = String(check?.createdBy?.role || "").toLowerCase();
  // "07.10.2026 14:33" -> sana va vaqt alohida qatorda (yarim kenglikka sig'adi).
  const [receiptDay, receiptTime = ""] = formatReceiptDate(check.createdAt).split(" ");
  const specialistLabel = creatorRole === "nurse" ? "Hamshira" : "Doktor";
  const departmentLabel = creatorRole === "nurse" ? "Muolaja xonasi" : "";
  const lorQueueCode = formatQueueCode(check?.lorQueue?.queueCode || check?.queueCode);
  const queueBlock =
    creatorRole === "lor" && lorQueueCode
      ? `<div class="queue"><span class="queue-label">NAVBAT</span><span class="queue-code">${escapeHtml(lorQueueCode)}</span></div>`
      : "";

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Chek</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        width: 80mm;
        min-height: 0;
        overflow: visible;
        font-family: Arial, sans-serif;
        font-size: 13px;
        color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      * { font-family: Arial, sans-serif; box-sizing: border-box; }

      /* 80mm qog'ozda printer faqat 72mm (576 nuqta) kenglikni bosadi va u sahifaning
         chap chetidan boshlanadi. Kontent 80mm markazida bo'lsa o'ng tomoni kesiladi,
         shuning uchun hammasi chapdagi 72mm ichida (2mm ichki chekka bilan) turadi. */
      .ticket { width: 72mm; margin: 0; padding: 0; }
      .inner { width: 72mm; margin: 0; padding: 8px 2mm 4px; }
      /* Pastda 10mm joy va oxirida qisqa chiziq. Oraliq butunlay oq bo'lmasin: drayver uzun oq
         oraliqni hujjat oxiri deb o'sha joydan kesib, chiziqni alohida bo'lak qilib chiqaradi.
         Shuning uchun chap chetda ingichka nuqtali vertikal chiziq oraliqni to'ldiradi. */
      .cut-tail { position: relative; width: 100%; height: 10mm; display: flex; align-items: flex-end; justify-content: center; }
      .cut-tail::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1px dotted #000; }
      .cut-tail::after { content: ""; width: 14mm; border-top: 1px solid #000; }

      .brand { text-align: center; line-height: 1; }
      .brand-name { font-size: 25px; font-weight: 900; letter-spacing: 1px; white-space: nowrap; }
      .brand-sub { margin-top: 5px; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

      .rule { border-top: 2px solid #000; margin: 8px 0; }

      /* Navbat raqami qora fonda oq: chekda birinchi ko'zga tashlanadi. */
      .queue { display: flex; align-items: center; justify-content: space-between; margin: 8px 0; padding: 6px 10px; border-radius: 6px; background: #000; color: #fff; }
      .queue-label { font-size: 15px; font-weight: 800; letter-spacing: 2px; }
      .queue-code { font-size: 34px; font-weight: 900; line-height: 1; }

      /* Sarlavha: bemor ismi katta, ostida chegarali blok (chek raqami, sana, mutaxassis). */
      .cap { font-size: 9.5px; font-weight: 800; letter-spacing: 1.6px; line-height: 1; }
      .patient { margin: 2px 0 6px; }
      .patient-name { margin-top: 3px; font-size: 18px; font-weight: 900; line-height: 1.15; word-break: break-word; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1.5px solid #000; border-radius: 6px; overflow: hidden; }
      .cell { padding: 5px 6px 6px; min-width: 0; }
      .cell + .cell { border-left: 1px solid #000; }
      .cell-wide { grid-column: 1 / -1; border-left: 0 !important; border-top: 1px solid #000; }
      .val { margin-top: 3px; font-size: 13px; font-weight: 800; line-height: 1.2; word-break: break-word; }
      .val-code { font-size: 18px; font-weight: 900; letter-spacing: 1.5px; line-height: 1.05; }
      .val-time { font-size: 11px; font-weight: 700; }

      .section-title { display: flex; align-items: center; gap: 6px; margin: 10px 0 2px; font-size: 12px; font-weight: 900; letter-spacing: 2px; }
      .section-title::before, .section-title::after { content: ""; flex: 1; border-top: 1.5px solid #000; }

      .item { padding: 5px 0; border-bottom: 1px dotted #000; }
      .item:last-child { border-bottom: 0; }
      .item-name { font-size: 14px; font-weight: 700; line-height: 1.25; word-break: break-word; }
      .item-line { display: flex; justify-content: space-between; align-items: baseline; margin-top: 2px; font-size: 13px; }
      .item-amount { font-weight: 800; white-space: nowrap; }
      .item-line-single { gap: 8px; margin-top: 0; }
      .item-line-single .item-name { flex: 1; min-width: 0; }

      .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; padding: 7px 0 5px; border-top: 3px solid #000; border-bottom: 3px solid #000; }
      .total-label { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
      .total-amount { font-size: 23px; font-weight: 900; white-space: nowrap; }
      .total-amount small { font-size: 13px; font-weight: 800; }

      .footer { margin-top: 10px; text-align: center; }
      .footer-main { font-size: 14px; font-weight: 800; }
      .footer-sub { margin-top: 3px; font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="ticket" data-sampi-receipt="check">
      <div class="inner">
        <div class="brand">
          <div class="brand-name">SAMPI MEDICINE</div>
          ${departmentLabel ? `<div class="brand-sub">${departmentLabel}</div>` : ""}
        </div>
        <div class="rule"></div>
        ${queueBlock}
        <div class="patient">
          <div class="cap">BEMOR</div>
          <div class="patient-name">${escapeHtml(check.patient?.fullName || "-")}</div>
        </div>
        <div class="meta-grid">
          <div class="cell">
            <div class="cap">CHEK №</div>
            <div class="val val-code">${escapeHtml(shortCheckId(check.checkId))}</div>
          </div>
          <div class="cell">
            <div class="cap">SANA</div>
            <div class="val">${escapeHtml(receiptDay)}</div>
            <div class="val-time">${escapeHtml(receiptTime)}</div>
          </div>
          <div class="cell cell-wide">
            <div class="cap">${specialistLabel.toUpperCase()}</div>
            <div class="val">${escapeHtml(check?.createdBy?.name || "-")}</div>
          </div>
        </div>
        ${section("DORILAR", medicineRows)}
        ${section("XIZMATLAR", serviceRows)}
        <div class="total">
          <span class="total-label">JAMI</span>
          <span class="total-amount">${escapeHtml(formatSum(check.total))} <small>so'm</small></span>
        </div>
        <div class="footer">
          <div class="footer-main">Doimo sog'-salomat bo'ling!</div>
          <div class="footer-sub">Tashrifingiz uchun rahmat</div>
        </div>
      </div>
      <div class="cut-tail"></div>
    </div>
    ${
      inline
        ? ""
        : `<script>
      let didPrint = false;

      function runPrint() {
        if (didPrint) return;
        didPrint = true;
        window.print();
      }

      window.onload = function () {
        setTimeout(runPrint, 80);
      };

      document.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          runPrint();
        }
      });

      window.onafterprint = function () {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
        }
        window.close();
      };
    </script>`
    }
  </body>
</html>`;
};

export const buildLorQueueTicketPrintHtml = (ticket, options = {}) => {
  const { inline = false } = options;
  const queueCode = formatQueueCode(ticket?.queueCode);
  const lorLabel = formatLorQueueTicketLabel(ticket);

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Navbat Cheki</title>
    <link
      href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      * {
        box-sizing: border-box;
      }
      @media print {
        @page {
          size: 80mm auto;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          width: 80mm;
          /* Ekrandagi kulrang fon va 100vh balandlik chekka tushmasin. */
          min-height: 0 !important;
          background: #fff !important;
          font-family: "Golos Text", Arial, sans-serif;
          text-align: center;
          display: block;
        }
        .check {
          display: flex;
          flex-direction: column;
          align-items: center;
          /* Bosiladigan kenglik 72mm, chap chetdan. */
          width: 72mm;
        }
        .title {
          width: 90%;
          max-width: 90%;
          font-size: 24px;
          font-weight: 600;
          line-height: 1.05;
          margin-top: 0;
          white-space: nowrap;
          letter-spacing: 0;
          overflow: hidden;
        }
        .divider {
          border: 0;
          border-top: 1.5px dashed #000;
          width: 90%;
          margin: 4px 0;
        }
        .small {
          width: 90%;
          max-width: 90%;
          font-size: 21px;
          font-weight: 600;
          line-height: 1.05;
          letter-spacing: 0;
          overflow: hidden;
        }
        .number {
          font-size: 132px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 0;
          width: 90%;
          max-width: 90%;
          text-align: center;
          line-height: 0.86;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          overflow: hidden;
        }
        .footer {
          width: 90%;
          max-width: 90%;
          font-size: 16px;
          font-weight: 600;
          line-height: 1.15;
          margin-top: 3px;
          white-space: nowrap;
          letter-spacing: 0;
          overflow: hidden;
        }
      }
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        overflow: visible;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        min-height: 100vh;
        background: #f5f5f5;
        font-family: "Golos Text", Arial, sans-serif;
        display: flex;
        justify-content: flex-start;
        align-items: flex-start;
        text-align: center;
      }
      .check {
        display: flex;
        flex-direction: column;
        align-items: center;
        box-sizing: border-box;
        width: 72mm;
        padding: 0;
        background: #fff;
        color: #000;
      }
      .title {
        width: 90%;
        max-width: 90%;
        font-size: 24px;
        font-weight: 600;
        line-height: 1.05;
        margin-top: 0;
        white-space: nowrap;
        letter-spacing: 0;
        overflow: hidden;
      }
      .divider {
        border: 0;
        border-top: 1.5px dashed #000;
        width: 90%;
        margin: 4px auto;
      }
      .small {
        width: 90%;
        max-width: 90%;
        font-size: 21px;
        font-weight: 600;
        line-height: 1.05;
        letter-spacing: 0;
        overflow: hidden;
      }
      .number {
        font-size: 132px;
        font-weight: 700;
        margin: 0;
        letter-spacing: 0;
        width: 90%;
        max-width: 90%;
        text-align: center;
        line-height: 0.86;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        overflow: hidden;
      }
      .footer {
        width: 90%;
        max-width: 90%;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.15;
        margin-top: 3px;
        white-space: nowrap;
        letter-spacing: 0;
        overflow: hidden;
      }
      /* Pastda 10mm joy va oxirida qisqa chiziq. Oraliq butunlay oq bo'lmasin: drayver uzun oq
         oraliqni hujjat oxiri deb o'sha joydan kesib, chiziqni alohida bo'lak qilib chiqaradi.
         Shuning uchun chap chetda ingichka nuqtali vertikal chiziq oraliqni to'ldiradi. */
      .cut-tail { position: relative; box-sizing: border-box; width: 100%; height: 10mm; display: flex; align-items: flex-end; justify-content: center; }
      .cut-tail::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1px dotted #000; }
      .cut-tail::after { content: ""; width: 14mm; border-top: 1px solid #000; }
    </style>
  </head>
  <body>
    <div class="check" data-sampi-receipt="lor-queue">
      <div class="title">SAMPI MEDICINE</div>
      <div class="divider"></div>
      <div class="small">${escapeHtml(lorLabel)}</div>
      <div class="divider"></div>
      <div class="small">Navbat raqami:</div>
      <div class="divider"></div>
      <div class="number">${escapeHtml(queueCode || "00")}</div>
      <div class="divider"></div>
      <div class="footer">Tashrifingiz uchun rahmat!</div>
      <div class="divider"></div>
      <div class="cut-tail"></div>
    </div>
    ${
      inline
        ? ""
        : `<script>
      let didPrint = false;

      function runPrint() {
        if (didPrint) return;
        didPrint = true;
        window.print();
      }

      window.onload = function () {
        setTimeout(runPrint, 80);
      };

      document.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          runPrint();
        }
      });

      window.onafterprint = function () {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
        }
        window.close();
      };
    </script>`
    }
  </body>
</html>`;
};

const isElectronDesktopApp = () => {
  try {
    return /Electron\//i.test(window.navigator.userAgent || "") || Boolean(window.sampiDesktop);
  } catch {
    return false;
  }
};

const cleanDesktopPrintError = (error) => {
  const raw = String(error?.message || error || "").trim();
  const nestedMatch = raw.match(/Error invoking remote method '[^']+': Error: (.+)$/);
  const message = nestedMatch?.[1] || raw;

  if (/Script failed to execute/i.test(message)) {
    return "Chek printerga tayyorlanmadi. Ilovani yangilab, qayta urinib ko'ring.";
  }

  if (message) return message;
  return "Chekni avtomatik printerga yuborib bo'lmadi.";
};

const printHtmlWithDesktopApp = async (html, options = {}) => {
  const desktopPrint = window.sampiDesktop?.printReceiptHtml;
  if (typeof desktopPrint !== "function") return null;

  try {
    const result = await desktopPrint(html, options);
    if (result?.ok === false) return false;
    // Natija obyekti (vaqtlar bilan) qaytariladi; u "true" kabi ishlatiladi.
    return result && typeof result === "object" ? result : true;
  } catch (error) {
    throw new Error(cleanDesktopPrintError(error));
  }
};

const openInlinePrintSession = () => ({
  __inlinePrint: true
});

const printHtmlInsideCurrentApp = (html) => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return false;
  }

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 100);
  };

  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60000);

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      cleanup();
    }
  }, 80);

  return true;
};

const printInsideCurrentApp = async (check) => {
  const html = buildCheckPrintHtml(check, { inline: true });
  const desktopResult = await printHtmlWithDesktopApp(html, {
    thermalReceipt: buildCheckThermalReceipt(check),
  });
  if (desktopResult !== null) return desktopResult;
  if (isElectronDesktopApp()) {
    throw new Error("Desktop printer ulanishi topilmadi. Ilovani yopib qayta oching.");
  }
  return printHtmlInsideCurrentApp(html);
};

const printLorQueueTicketInsideCurrentApp = async (ticket) => {
  const html = buildLorQueueTicketPrintHtml(ticket, { inline: true });
  const desktopResult = await printHtmlWithDesktopApp(html, {
    thermalReceipt: buildLorQueueThermalReceipt(ticket),
  });
  if (desktopResult !== null) return desktopResult;
  if (isElectronDesktopApp()) {
    throw new Error("Desktop printer ulanishi topilmadi. Ilovani yopib qayta oching.");
  }
  return printHtmlInsideCurrentApp(html);
};

// Chek ilova qayerda ochilgan bo'lsa (sayt, PWA, desktop) o'sha joyning o'zida
// chop etiladi; yangi brauzer oynasi ochilmaydi.
export const openPendingPrintTab = () => openInlinePrintSession();

export const writeCheckToPrintTab = async (printSession, check) => {
  if (!printSession) return false;

  if (printSession.__inlinePrint) {
    return await printInsideCurrentApp(check);
  }

  if (!printSession.tab || printSession.tab.closed) return false;

  printSession.tab.document.open();
  printSession.tab.document.write(buildCheckPrintHtml(check));
  printSession.tab.document.close();
  return true;
};

export const writeLorQueueTicketToPrintTab = async (printSession, ticket) => {
  if (!printSession) return false;

  if (printSession.__inlinePrint) {
    return await printLorQueueTicketInsideCurrentApp(ticket);
  }

  if (!printSession.tab || printSession.tab.closed) return false;

  printSession.tab.document.open();
  printSession.tab.document.write(buildLorQueueTicketPrintHtml(ticket));
  printSession.tab.document.close();
  return true;
};

// Desktop ilovada keyingi navbat chekining rasmi oldindan tayyorlanadi (chek tezroq chiqadi).
export const prerenderLorQueueTicket = (ticket) => {
  const prerender = typeof window !== "undefined" ? window.sampiDesktop?.prerenderReceiptHtml : null;
  if (typeof prerender !== "function" || !ticket?.queueCode) return;
  prerender(buildLorQueueTicketPrintHtml(ticket, { inline: true })).catch(() => {});
};

export const closePrintTab = (printSession) => {
  if (!printSession || printSession.__inlinePrint) return;
  if (printSession.tab && !printSession.tab.closed) {
    printSession.tab.close();
  }
};

// Hisobchi uchun kunlik hisobot: 80mm chek printeriga chiqadi.
export const buildAccountantReportPrintHtml = (report) => {
  const row = (label, value, strong = false) =>
    `<tr class="${strong ? "strong" : ""}"><td>${escapeHtml(label)}</td><td>${escapeHtml(formatSum(value))}</td></tr>`;
  const doctors = (report.doctors || [])
    .map(
      (doctor) => `<div class="doc"><div class="doc-name">${escapeHtml(doctor.name)}</div><table>
        ${row(`Bemorlar: ${doctor.patients} ta, tushum`, doctor.collected)}
        ${row(`Doktorga ${report.doctorSharePercent}%`, doctor.doctorShare, true)}
        ${row("Klinikaga", doctor.clinicShare)}
        ${doctor.debtLeft > 0 ? row("Qarz qoldi", doctor.debtLeft) : ""}
      </table></div>`
    )
    .join("");
  const utilities = report.utilities?.entered
    ? (report.utilities.items || []).map((item) => row(item.label, item.amount)).join("")
    : `<tr><td colspan="2">Hisobotchi hali kiritmagan</td></tr>`;
  const expenses = (report.expenses?.items || [])
    .map((item) => row(item.reason, item.amount))
    .join("");
  const [year, month, day] = String(report.date || "").split("-");

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Hisobchi hisoboti</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; width: 80mm; font-family: Arial, sans-serif; font-size: 13px; color: #000; background: #fff; }
      * { font-family: Arial, sans-serif; box-sizing: border-box; }
      .ticket { width: 72mm; }
      .inner { width: 72mm; padding: 8px 2mm 4px; }
      .cut-tail { position: relative; width: 100%; height: 10mm; display: flex; align-items: flex-end; justify-content: center; }
      .cut-tail::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1px dotted #000; }
      .cut-tail::after { content: ""; width: 14mm; border-top: 1px solid #000; }
      .brand { text-align: center; font-size: 22px; font-weight: 900; letter-spacing: 1px; }
      .sub { text-align: center; margin-top: 4px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .date { text-align: center; margin-top: 2px; font-size: 12px; }
      .rule { border-top: 2px solid #000; margin: 8px 0; }
      .title { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px; font-size: 12px; font-weight: 900; letter-spacing: 2px; }
      .title::before, .title::after { content: ""; flex: 1; border-top: 1.5px solid #000; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 2px 0; vertical-align: top; }
      td:last-child { text-align: right; white-space: nowrap; font-weight: 700; padding-left: 6px; }
      tr.strong td { font-weight: 900; font-size: 14px; }
      .doc { padding: 4px 0; border-bottom: 1px dotted #000; }
      .doc:last-child { border-bottom: 0; }
      .doc-name { font-size: 14px; font-weight: 900; }
      .total { margin-top: 6px; padding: 6px 0; border-top: 3px solid #000; border-bottom: 3px solid #000; }
      .total td { font-size: 15px; font-weight: 900; }
    </style>
  </head>
  <body>
    <div class="ticket" data-sampi-receipt="check">
      <div class="inner">
        <div class="brand">SAMPI MEDICINE</div>
        <div class="sub">HISOBCHI HISOBOTI</div>
        <div class="date">${escapeHtml(`${day}.${month}.${year}`)} smena</div>
        <div class="rule"></div>
        ${doctors ? `<div class="title"><span>LOR DOKTORLAR</span></div>${doctors}` : ""}
        <div class="title"><span>PROTSEDURA</span></div>
        <table>
          ${row(`Bemorlar: ${report.procedures?.patients || 0} ta, tushum`, report.procedures?.collected)}
          ${report.procedures?.debtLeft > 0 ? row("Qarz qoldi", report.procedures.debtLeft) : ""}
        </table>
        <div class="title"><span>TO'LOV TURLARI</span></div>
        <table>
          ${row("Naqd", report.byPaymentMethod?.cash)}
          ${row("Karta", report.byPaymentMethod?.card)}
          ${row("O'tkazma", report.byPaymentMethod?.transfer)}
        </table>
        ${expenses ? `<div class="title"><span>XARAJATLAR</span></div><table>${expenses}</table>` : ""}
        <div class="title"><span>SVET, GAZ, SUV</span></div>
        <table>${utilities}</table>
        <div class="title"><span>QARZLAR</span></div>
        <table>
          ${row("Bugun qarz qoldi", report.debts?.newDebt)}
          ${row("Eski qarz to'landi", report.debts?.repaid)}
          ${row(`Jami qarz (${report.debts?.outstandingCount || 0} ta)`, report.debts?.outstandingTotal)}
        </table>
        <table class="total">
          ${row("Jami tushum", report.summary?.totalCollected)}
          ${row("Doktorlarga", report.summary?.doctorsShare)}
          ${row("Kassa xarajatlari", report.summary?.expenses)}
          ${row("Svet, gaz, suv", report.summary?.utilities)}
          ${row("Klinikaga sof", report.summary?.clinicNet, true)}
        </table>
        <table>${row("Kassada naqd", report.summary?.cashInHand, true)}</table>
      </div>
      <div class="cut-tail"></div>
    </div>
  </body>
</html>`;
};

export const printAccountantReport = async (report) => {
  const html = buildAccountantReportPrintHtml(report);
  const desktopResult = await printHtmlWithDesktopApp(html);
  if (desktopResult !== null) return desktopResult;
  return printHtmlInsideCurrentApp(html);
};
