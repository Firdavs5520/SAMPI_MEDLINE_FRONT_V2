const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;
const { app, BrowserWindow } = require("electron");

const rootDir = path.resolve(__dirname, "..");
app.on("window-all-closed", (event) => {
  event.preventDefault();
});

const premiumIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Sampi Medline">
  <defs>
    <linearGradient id="bg" x1="62" y1="46" x2="462" y2="470" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#063846"/>
      <stop offset="0.45" stop-color="#0f8aa4"/>
      <stop offset="1" stop-color="#1bb6bd"/>
    </linearGradient>
    <radialGradient id="glow" cx="32%" cy="19%" r="70%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="176" y1="160" x2="344" y2="352" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#063948"/>
      <stop offset="1" stop-color="#0d6f84"/>
    </linearGradient>
    <filter id="shadow" x="-18%" y="-18%" width="136%" height="136%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#04252f" flood-opacity="0.28"/>
    </filter>
    <filter id="markShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#07313b" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect x="38" y="34" width="436" height="444" rx="112" fill="url(#bg)" filter="url(#shadow)"/>
  <rect x="55" y="51" width="402" height="410" rx="96" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="18"/>
  <path d="M85 148C111 85 177 62 253 62c91 0 160 38 194 112-53-42-122-62-204-62-66 0-119 12-158 36Z" fill="url(#glow)"/>
  <path d="M94 380c82 54 236 60 326-23-32 69-89 103-168 103-72 0-124-25-158-80Z" fill="#052b36" opacity="0.18"/>
  <circle cx="256" cy="256" r="139" fill="#f3fcfd" opacity="0.98"/>
  <circle cx="256" cy="256" r="111" fill="#e0fbff" opacity="0.92"/>
  <path d="M229 158h54c10.5 0 19 8.5 19 19v52h52c10.5 0 19 8.5 19 19v54c0 10.5-8.5 19-19 19h-52v52c0 10.5-8.5 19-19 19h-54c-10.5 0-19-8.5-19-19v-52h-52c-10.5 0-19-8.5-19-19v-54c0-10.5 8.5-19 19-19h52v-52c0-10.5 8.5-19 19-19Z" fill="url(#mark)" filter="url(#markShadow)"/>
  <path d="M166 247h58c7.7 0 14-6.3 14-14v-58c0-5.5 4.5-10 10-10h27c-18-8-43-7-58 7-13 12-14 31-14 48h-45c-13 0-23 10-24 23-1 11 3 21 11 27 0-13 8-23 21-23Z" fill="#ffffff" opacity="0.18"/>
</svg>
`;

const fileTargets = [
  ["public/favicon.svg", premiumIconSvg],
];

const pngTargets = [
  ["public/icons/pwa-192.png", 192],
  ["public/icons/pwa-192-v7.png", 192],
  ["public/icons/pwa-256-v7.png", 256],
  ["public/icons/pwa-512.png", 512],
  ["public/icons/pwa-512-v7.png", 512],
  ["public/icons/pwa-512-maskable.png", 512],
  ["public/icons/pwa-512-maskable-v7.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
  ["public/icons/apple-touch-icon-v7.png", 180],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png", 48],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png", 108],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png", 72],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png", 162],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png", 96],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png", 216],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png", 144],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png", 324],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png", 192],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png", 432],
];

const icoSizes = [16, 24, 32, 48, 64, 128, 256];

const ensureDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const renderPng = async (svg, size) => {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;background:transparent;overflow:hidden">
    <canvas id="icon" width="${size}" height="${size}"></canvas>
    <script>
      const svg = ${JSON.stringify(svg)};
      const canvas = document.getElementById("icon");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        window.__iconDataUrl = canvas.toDataURL("image/png");
      };
      img.onerror = () => {
        window.__iconError = "SVG render failed";
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    </script>
  </body>
</html>`;

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const dataUrl = await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        let attempts = 0;
        const tick = () => {
          if (window.__iconDataUrl) {
            resolve(window.__iconDataUrl);
            return;
          }
          if (window.__iconError) {
            reject(new Error(window.__iconError));
            return;
          }
          attempts += 1;
          if (attempts > 100) {
            reject(new Error("SVG render timed out"));
            return;
          }
          setTimeout(tick, 40);
        };
        tick();
      });
    `);
    if (!dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error(`Unexpected PNG data URL: ${dataUrl.slice(0, 40)}`);
    }

    const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
    if (!buffer.length) {
      throw new Error(`Rendered ${size}px icon is empty`);
    }

    return buffer;
  } finally {
    win.close();
  }
};

const writePng = async (relativePath, size) => {
  const outputPath = path.join(rootDir, relativePath);
  const buffer = await renderPng(premiumIconSvg, size);
  await ensureDir(outputPath);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
};

const writeIco = async (relativePath) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sampi-icons-"));
  const pngPaths = [];

  try {
    for (const size of icoSizes) {
      const pngPath = path.join(tempDir, `icon-${size}.png`);
      const buffer = await renderPng(premiumIconSvg, size);
      await fs.writeFile(pngPath, buffer);
      pngPaths.push(pngPath);
    }

    const ico = await pngToIco(pngPaths);
    const outputPath = path.join(rootDir, relativePath);
    await ensureDir(outputPath);
    await fs.writeFile(outputPath, ico);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const run = async () => {
  await app.whenReady();

  for (const [relativePath, content] of fileTargets) {
    const outputPath = path.join(rootDir, relativePath);
    await ensureDir(outputPath);
    await fs.writeFile(outputPath, content);
  }

  for (const [relativePath, size] of pngTargets) {
    await writePng(relativePath, size);
  }

  await writeIco("public/favicon.ico");
  await writeIco("build/icon.ico");

  app.quit();
};

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
