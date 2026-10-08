const { BrowserWindow } = require("electron");

// 80mm printer 72mm (576 nuqta, 203 dpi) kenglikka bosadi.
const RASTER_WIDTH_DOTS = 576;
const RECEIPT_WIDTH_CSS_PX = (72 / 25.4) * 96;
const RASTER_ZOOM = RASTER_WIDTH_DOTS / RECEIPT_WIDTH_CSS_PX;
const RASTER_MAX_HEIGHT_DOTS = 8000;
// Uzun chek bir katta rasm emas, shu balandlikdagi bo'laklarda olinadi: katta rasm olish ba'zan
// "UnknownVizError" bilan tushib, chek drayver orqali (bo'linib) chiqardi.
const CAPTURE_TILE_DOTS = 1024;
const CAPTURE_ATTEMPTS = 3;
const RASTER_ROWS_PER_COMMAND = 255;
const BLACK_THRESHOLD = 160;
// Oxirgi qatordan keyin ~10mm (80 nuqta) qog'oz surib, keyin qisman kesadi.
const CUT_FEED_DOTS = 80;

// Rasm sifatida chop etilganda pastdagi HTML "dumi" kerak emas: bo'sh joy va kesishni
// ESC/POS buyrug'i o'zi beradi.
const RASTER_CSS = `
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; min-height: 0 !important; overflow: hidden !important; }
  ::-webkit-scrollbar { display: none !important; }
  .cut-tail { display: none !important; }
`;

const waitForPaint = (webContents) =>
  webContents.executeJavaScript(
    `new Promise((resolve) => {
      const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      const fontsReady = document.fonts?.ready
        ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))])
        : Promise.resolve();
      fontsReady.then(done);
    })`,
    true
  );

const measureReceiptHeight = (webContents) =>
  webContents.executeJavaScript(
    `(() => {
      const receipt = document.querySelector("[data-sampi-receipt]") || document.body;
      const rect = receipt.getBoundingClientRect();
      return Math.ceil(rect.bottom);
    })()`,
    true
  );

// Bitta bo'lakni oladi (xato bo'lsa qayta urinadi) va aniq 576 x tileHeight BGRA qaytaradi.
const captureTile = async (webContents, y, tileHeight) => {
  let lastError = null;
  for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      let image = await webContents.capturePage({
        x: 0,
        y,
        width: RASTER_WIDTH_DOTS,
        height: tileHeight,
      });
      if (image.isEmpty()) throw new Error("Chek rasmi olinmadi.");
      const size = image.getSize();
      if (size.width !== RASTER_WIDTH_DOTS || size.height !== tileHeight) {
        image = image.resize({ width: RASTER_WIDTH_DOTS, height: tileHeight, quality: "best" });
      }
      return image.toBitmap();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError || new Error("Chek rasmi olinmadi.");
};

// Chekni oq-qora rasmga aylantiradi: har qatorda 72 bayt (576 nuqta), 1 = qora.
const renderReceiptRaster = async (html) => {
  const win = new BrowserWindow({
    width: RASTER_WIDTH_DOTS,
    height: 400,
    show: false,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      javascript: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    const encodedHtml = Buffer.from(html, "utf8").toString("base64");
    try {
      await win.loadURL(`data:text/html;charset=utf-8;base64,${encodedHtml}`);
    } catch (error) {
      // Tashqi resurs (masalan Google Fonts) yuklanmasa ham chek o'zi yuklangan bo'lsa davom etiladi.
      const loaded = await win.webContents
        .executeJavaScript(`Boolean(document.querySelector("[data-sampi-receipt]"))`, true)
        .catch(() => false);
      if (!loaded) throw error;
    }
    await win.webContents.insertCSS(RASTER_CSS);
    win.webContents.setZoomFactor(RASTER_ZOOM);
    await waitForPaint(win.webContents);

    const cssHeight = await measureReceiptHeight(win.webContents);
    const heightDots = Math.min(RASTER_MAX_HEIGHT_DOTS, Math.ceil(cssHeight * RASTER_ZOOM) + 4);
    if (!Number.isFinite(heightDots) || heightDots < 24) {
      throw new Error(`Chek rasmi bo'sh chiqdi (balandlik ${cssHeight}).`);
    }

    win.setContentSize(RASTER_WIDTH_DOTS, heightDots);
    await waitForPaint(win.webContents);

    const tiles = [];
    for (let y = 0; y < heightDots; y += CAPTURE_TILE_DOTS) {
      const tileHeight = Math.min(CAPTURE_TILE_DOTS, heightDots - y);
      tiles.push(await captureTile(win.webContents, y, tileHeight));
    }

    return bitmapToRaster(Buffer.concat(tiles), { width: RASTER_WIDTH_DOTS, height: heightDots });
  } finally {
    if (!win.isDestroyed()) {
      await new Promise((resolve) => {
        win.once("closed", resolve);
        win.close();
      });
    }
  }
};

// BGRA bitmap -> 1 bitli qatorlar. Pastdagi bo'sh qatorlar olib tashlanadi.
const bitmapToRaster = (bitmap, { width, height }) => {
  const bytesPerRow = Math.ceil(RASTER_WIDTH_DOTS / 8);
  const rows = Buffer.alloc(bytesPerRow * height);
  let lastInkRow = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < Math.min(width, RASTER_WIDTH_DOTS); x += 1) {
      const offset = (y * width + x) * 4;
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      const alpha = bitmap[offset + 3];
      const luminance = alpha === 0 ? 255 : 0.299 * red + 0.587 * green + 0.114 * blue;
      if (luminance < BLACK_THRESHOLD) {
        rows[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        lastInkRow = y;
      }
    }
  }

  if (lastInkRow < 0) {
    throw new Error("Chek rasmida hech narsa yo'q.");
  }

  const usedHeight = lastInkRow + 1;
  return {
    widthDots: RASTER_WIDTH_DOTS,
    heightDots: usedHeight,
    bytesPerRow,
    data: rows.subarray(0, bytesPerRow * usedHeight),
  };
};

// ESC @, keyin GS v 0 bloklari, oxirida GS V 66 n (n nuqta surib, qisman kesish).
const buildEscPosRasterPayload = (raster, { cutFeedDots = CUT_FEED_DOTS } = {}) => {
  const buffers = [Buffer.from([0x1b, 0x40])];

  for (let startRow = 0; startRow < raster.heightDots; startRow += RASTER_ROWS_PER_COMMAND) {
    const rowCount = Math.min(RASTER_ROWS_PER_COMMAND, raster.heightDots - startRow);
    buffers.push(
      Buffer.from([
        0x1d,
        0x76,
        0x30,
        0x00,
        raster.bytesPerRow & 0xff,
        (raster.bytesPerRow >> 8) & 0xff,
        rowCount & 0xff,
        (rowCount >> 8) & 0xff,
      ])
    );
    buffers.push(
      raster.data.subarray(startRow * raster.bytesPerRow, (startRow + rowCount) * raster.bytesPerRow)
    );
  }

  buffers.push(Buffer.from([0x1d, 0x56, 0x42, Math.max(0, Math.min(255, cutFeedDots))]));
  return Buffer.concat(buffers);
};

module.exports = {
  RASTER_WIDTH_DOTS,
  renderReceiptRaster,
  bitmapToRaster,
  buildEscPosRasterPayload,
};
