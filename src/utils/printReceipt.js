const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatNumber = (value) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safe.toLocaleString("uz-UZ");
};

const formatCheckDate = (value) => {
  if (!value) return "-";
  const safeDate = new Date(value);
  if (Number.isNaN(safeDate.getTime())) return "-";
  return safeDate.toLocaleString("uz-UZ");
};

const resolveItemType = (item, checkType) => {
  const fromItem = String(item?.itemType || "").toLowerCase();
  if (fromItem) return fromItem;
  const fromCheck = String(checkType || "").toLowerCase();
  if (fromCheck === "medicine" || fromCheck === "service") return fromCheck;
  return "";
};

const formatLorIdentity = (value) => {
  const raw = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (raw === "lor1" || raw === "lor") return "LOR";
  const match = raw.match(/lor(\d+)/);
  if (match) return `Lor-${match[1]}`;
  if (!raw) return "-";
  return String(value || "-");
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
    { text: "SAMPI MEDLINE", align: "center", bold: true, size: "double" },
    { kind: "divider" },
    { text: `Bemor: ${check?.patient?.fullName || "-"}` },
    { text: `Sana: ${formatCheckDate(check?.createdAt)}` },
  ];

  if (creatorRole === "lor") {
    blocks.push({ text: formatLorIdentity(check?.createdBy?.lorIdentity), align: "center", bold: true });
  }

  if (creatorRole === "lor" && lorQueueCode) {
    blocks.push({ text: `Navbat: ${lorQueueCode}`, align: "center", bold: true, size: "double" });
  }

  const appendItems = (title, itemType) => {
    const items = (check?.items || []).filter((item) => resolveItemType(item, check?.type) === itemType);
    if (!items.length) return;

    blocks.push({ kind: "divider" });
    blocks.push({ text: title, align: "center", bold: true });
    blocks.push({ kind: "divider" });

    items.forEach((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      blocks.push({
        kind: "row",
        left: `${item.name} x${quantity}`,
        right: `${formatNumber(unitPrice * quantity)} so'm`,
        font: "small",
      });
    });
  };

  appendItems("Dorilar", "medicine");
  appendItems("Xizmatlar", "service");

  blocks.push({ kind: "divider" });
  blocks.push({
    kind: "row",
    left: "Jami:",
    right: `${formatNumber(check?.total)} so'm`,
    bold: true,
  });
  blocks.push({ kind: "divider" });

  if (creatorRole === "nurse") {
    blocks.push({ text: `Hamshira: ${check?.createdBy?.name || "-"}`, align: "center", bold: true });
  } else if (creatorRole === "lor") {
    blocks.push({ text: check?.createdBy?.name || "-", align: "center", bold: true });
  }

  blocks.push({ text: "Doimo sog'-salomat bo'ling", align: "center" });
  return { type: "check", blocks };
};

const buildLorQueueThermalReceipt = (ticket) => {
  const queueCode = formatQueueCode(ticket?.queueCode);
  const lorLabel = formatLorQueueTicketLabel(ticket);
  return {
    type: "lor-queue",
    blocks: [
      { text: "SAMPI MEDLINE", align: "center", bold: true, size: "double" },
      { kind: "divider" },
      { text: lorLabel, align: "center", bold: true, size: "double" },
      { kind: "divider" },
      { text: "Navbat raqami:", align: "center", bold: true, size: "double" },
      { kind: "divider" },
      { text: queueCode || "00", align: "center", bold: true, size: "huge" },
      { kind: "divider" },
      { text: "Tashrifingiz uchun rahmat!", align: "center", bold: true },
      { kind: "divider" },
    ],
  };
};

const buildItemRows = (items, itemType, checkType) => {
  return (items || [])
    .filter((item) => resolveItemType(item, checkType) === itemType)
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const lineTotal = unitPrice * quantity;
      const line = `${escapeHtml(item.name)} x${escapeHtml(quantity)}`;
      return `<div class="row"><span class="name">${line}</span><span class="price">${escapeHtml(formatNumber(lineTotal))} so'm</span></div>`;
    })
    .join("");
};

export const buildCheckPrintHtml = (check, options = {}) => {
  const { inline = false } = options;
  const medicineRows = buildItemRows(check.items, "medicine", check.type);
  const serviceRows = buildItemRows(check.items, "service", check.type);

  const medicineSection =
    medicineRows.length > 0
      ? `<div class="section-title">Dorilar</div><div class="divider"></div>${medicineRows}<div class="divider"></div>`
      : "";

  const serviceSection =
    serviceRows.length > 0
      ? `<div class="section-title">Xizmatlar</div><div class="divider"></div>${serviceRows}<div class="divider"></div>`
      : "";
  const creatorRole = String(check?.createdBy?.role || "").toLowerCase();
  const specialistLine =
    creatorRole === "nurse"
      ? `<div class="nurse-line">Hamshira: ${escapeHtml(check?.createdBy?.name || "-")}</div>`
      : creatorRole === "lor"
        ? `<div class="nurse-line">${escapeHtml(check?.createdBy?.name || "-")}</div>`
        : "";
  const lorIdentityLine =
    creatorRole === "lor"
      ? `<div class="text">${escapeHtml(formatLorIdentity(check?.createdBy?.lorIdentity))}</div>`
      : "";
  const lorQueueCode = formatQueueCode(check?.lorQueue?.queueCode || check?.queueCode);
  const lorQueueLine =
    creatorRole === "lor" && lorQueueCode
      ? `<div class="queue-line">Navbat: ${escapeHtml(lorQueueCode)}</div>`
      : "";

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Chek</title>
    <style>
      @page { size: 58mm auto; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        width: 58mm;
        min-height: 0;
        overflow: visible;
        font-family: Arial, sans-serif;
        font-size: 12px;
        color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      * {
        font-family: Arial, sans-serif;
      }

      .ticket { box-sizing: border-box; width: 58mm; margin: 0; padding: 0 0 2mm; }
      .inner { width: 48mm; margin: 0 auto; padding: 6px 0; }
      .check-title {
        text-align: center;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .divider {
        border-top: 2px dashed #000;
        margin: 6px 0;
      }
      .text {
        text-align: center;
        font-size: 15px;
        margin: 2px 0;
      }
      .queue-line {
        margin: 4px 0 2px;
        text-align: center;
        font-size: 20px;
        font-weight: 900;
      }
      .section-title {
        text-align: center;
        font-size: 16px;
        font-weight: 800;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 6px;
        font-size: 15px;
        margin: 2px 0;
      }
      .name {
        flex: 1;
        min-width: 0;
        word-break: break-word;
        text-align: left;
      }
      .price {
        white-space: nowrap;
        font-weight: 700;
      }
      .jami {
        display: flex;
        justify-content: space-between;
        font-size: 17px;
        font-weight: 800;
      }
      .nurse-line { margin-top: 8px; text-align: center; font-size: 14px; font-weight: 700; }
      .footer {
        margin-top: 8px;
        text-align: center;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="ticket" data-sampi-receipt="check">
      <div class="inner">
        <div class="check-title">SAMPI MEDLINE</div>

        <div class="divider"></div>

        <div class="text">Bemor: ${escapeHtml(check.patient?.fullName || "-")}</div>
        <div class="text">Sana: ${escapeHtml(formatCheckDate(check.createdAt))}</div>
        ${lorIdentityLine}
        ${lorQueueLine}

        <div class="divider"></div>
        ${medicineSection}
        ${serviceSection}

        <div class="jami">
          <span>Jami:</span>
          <span>${escapeHtml(formatNumber(check.total))} so'm</span>
        </div>
        <div class="divider"></div>

        ${specialistLine}
        <div class="footer">Doimo sog'-salomat bo'ling</div>
      </div>
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
          size: 58mm auto;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          width: 58mm;
          font-family: "Golos Text", Arial, sans-serif;
          text-align: center;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        .check {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        .title {
          width: 100%;
          font-size: 25px;
          font-weight: 600;
          line-height: 1.05;
          margin-top: 0;
          white-space: nowrap;
          letter-spacing: 0;
        }
        .divider {
          border: 0;
          border-top: 1.5px dashed #000;
          width: 90%;
          margin: 4px 0;
        }
        .small {
          font-size: 21px;
          font-weight: 600;
          line-height: 1.05;
          letter-spacing: 0;
        }
        .number {
          font-size: 132px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 0;
          width: 100%;
          text-align: center;
          line-height: 0.86;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .footer {
          font-size: 17px;
          font-weight: 600;
          line-height: 1.15;
          margin-top: 3px;
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
        justify-content: center;
        align-items: flex-start;
        text-align: center;
      }
      .check {
        display: flex;
        flex-direction: column;
        align-items: center;
        box-sizing: border-box;
        width: 58mm;
        padding: 0 0 2mm;
        background: #fff;
        color: #000;
      }
      .title {
        width: 100%;
        font-size: 25px;
        font-weight: 600;
        line-height: 1.05;
        margin-top: 0;
        white-space: nowrap;
        letter-spacing: 0;
      }
      .divider {
        border: 0;
        border-top: 1.5px dashed #000;
        width: 90%;
        margin: 4px auto;
      }
      .small {
        font-size: 21px;
        font-weight: 600;
        line-height: 1.05;
        letter-spacing: 0;
      }
      .number {
        font-size: 132px;
        font-weight: 700;
        margin: 0;
        letter-spacing: 0;
        width: 100%;
        text-align: center;
        line-height: 0.86;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .footer {
        font-size: 17px;
        font-weight: 600;
        line-height: 1.15;
        margin-top: 3px;
      }
    </style>
  </head>
  <body>
    <div class="check" data-sampi-receipt="lor-queue">
      <div class="title">SAMPI MEDLINE</div>
      <div class="divider"></div>
      <div class="small">${escapeHtml(lorLabel)}</div>
      <div class="divider"></div>
      <div class="small">Navbat raqami:</div>
      <div class="divider"></div>
      <div class="number">${escapeHtml(queueCode || "00")}</div>
      <div class="divider"></div>
      <div class="footer">Tashrifingiz uchun rahmat!</div>
      <div class="divider"></div>
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

const isStandalonePwa = () => {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.startsWith("android-app://")
    );
  } catch {
    return false;
  }
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
    return Boolean(result?.ok ?? true);
  } catch (error) {
    throw new Error(cleanDesktopPrintError(error));
  }
};

const openInlinePrintSession = () => ({
  __inlinePrint: true
});

const openBrowserPrintTab = () => {
  const printTab = window.open("about:blank", "_blank");
  if (!printTab) return null;

  printTab.document.open();
  printTab.document.write(
    "<!doctype html><html><head><title>Chek tayyorlanmoqda...</title><style>body{font-family:Arial,sans-serif;font-size:16px;font-weight:700;padding:12px;}</style></head><body>Chek tayyorlanmoqda...</body></html>"
  );
  printTab.document.close();
  return {
    __inlinePrint: false,
    tab: printTab
  };
};

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

export const openPendingPrintTab = () => {
  if (isStandalonePwa() || isElectronDesktopApp()) {
    return openInlinePrintSession();
  }

  return openBrowserPrintTab();
};

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

export const closePrintTab = (printSession) => {
  if (!printSession || printSession.__inlinePrint) return;
  if (printSession.tab && !printSession.tab.closed) {
    printSession.tab.close();
  }
};
