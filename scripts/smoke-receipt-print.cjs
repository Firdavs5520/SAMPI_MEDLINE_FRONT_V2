const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const { app, BrowserWindow } = require("electron");

const outputDir = path.resolve(__dirname, "../../outputs");
const receiptWidthMicrons = 58000;
const micronsPerCssPixel = 25400 / 96;

const waitForLayout = (win) =>
  win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const done = () => {
        const receipt =
          document.querySelector("[data-sampi-receipt]") ||
          document.querySelector(".ticket") ||
          document.querySelector(".check") ||
          document.body;
        const box = receipt.getBoundingClientRect();
        const text = String(document.body?.innerText || "").trim();
        resolve({
          text,
          width: Math.ceil(Math.max(box.width, receipt.scrollWidth, document.body.scrollWidth)),
          height: Math.ceil(Math.max(box.height, receipt.scrollHeight))
        });
      };
      const afterFonts = () => requestAnimationFrame(() => requestAnimationFrame(done));
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(afterFonts).catch(afterFonts);
      } else {
        afterFonts();
      }
    })
  `);

const renderReceipt = async ({ name, html, expectedText }) => {
  const win = new BrowserWindow({
    width: 260,
    height: 720,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    const encodedHtml = Buffer.from(html, "utf8").toString("base64");
    await win.loadURL(`data:text/html;charset=utf-8;base64,${encodedHtml}`);
    const metrics = await waitForLayout(win);

    const pageSize = {
      width: receiptWidthMicrons,
      height: Math.ceil(metrics.height * micronsPerCssPixel) + 4000,
    };
    const image = await win.webContents.capturePage({
      x: 0,
      y: 0,
      width: 260,
      height: Math.min(720, Math.max(180, metrics.height + 12)),
    });

    await fs.mkdir(outputDir, { recursive: true });
    const screenshotPath = path.join(outputDir, `${name}.png`);
    await fs.writeFile(screenshotPath, image.toPNG());

    const failed = [
      ["hasExpectedText", metrics.text.includes(expectedText)],
      ["hasReceiptHeight", metrics.height > 120],
      ["hasReceiptWidth", metrics.width >= 180 && metrics.width <= 240],
      ["hasPrintablePageHeight", pageSize.height > 45000],
    ].filter(([, ok]) => !ok);

    if (failed.length) {
      throw new Error(
        `${name} receipt smoke failed: ${JSON.stringify(
          { failed: failed.map(([key]) => key), metrics, pageSize, screenshotPath },
          null,
          2
        )}`
      );
    }

    return { name, metrics, pageSize, screenshotPath };
  } finally {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
};

const run = async () => {
  const receiptModulePath = path.resolve(__dirname, "../src/utils/printReceipt.js");
  const { buildCheckPrintHtml, buildLorQueueTicketPrintHtml } = await import(
    pathToFileURL(receiptModulePath).href
  );

  await app.whenReady();

  const results = [];
  results.push(
    await renderReceipt({
      name: "receipt-check",
      expectedText: "Jami:",
      html: buildCheckPrintHtml(
        {
          patient: { fullName: "Test Bemor" },
          createdAt: "2026-08-27T07:15:00.000Z",
          createdBy: { role: "lor", name: "LOR shifokor", lorIdentity: "lor1" },
          lorQueue: { queueCode: "12" },
          type: "service",
          items: [
            { name: "LOR ko'rigi", itemType: "service", quantity: 1, price: 50000 },
            { name: "Qo'shimcha xizmat", itemType: "service", quantity: 2, price: 15000 },
          ],
          total: 80000,
        },
        { inline: true }
      ),
    })
  );
  results.push(
    await renderReceipt({
      name: "receipt-lor-queue",
      expectedText: "Navbat raqami:",
      html: buildLorQueueTicketPrintHtml({ queueCode: "27" }, { inline: true }),
    })
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        receipts: results.map(({ name, metrics, pageSize, screenshotPath }) => ({
          name,
          widthPx: metrics.width,
          heightPx: metrics.height,
          pageSize,
          screenshotPath,
        })),
      },
      null,
      2
    )
  );

  app.quit();
};

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
