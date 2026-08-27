const fs = require("fs/promises");
const path = require("path");
const { app, BrowserWindow, session } = require("electron");

const TEST_ORIGIN = process.env.SAMPI_SMOKE_ORIGIN || "http://127.0.0.1:4174";
const outputDir = path.resolve(__dirname, "../../outputs");

const API_URLS = [
  "https://sampi-medline-back-v2.onrender.com/*",
  "http://localhost:5000/*",
];

const viewports = [
  { name: "tv-fhd-50", width: 1920, height: 1080, ticketCount: 80 },
  { name: "tv-capture-50", width: 1910, height: 970, ticketCount: 40 },
  { name: "tv-hd-fallback", width: 1366, height: 768, ticketCount: 24 },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getWaitingGridMeta = (count) => {
  if (count > 60) return { columns: 5, densityClass: "sampi-tv-waiting-menu-ultra" };
  if (count > 30) return { columns: 4, densityClass: "sampi-tv-waiting-menu-ultra" };
  if (count > 16) return { columns: 3, densityClass: "sampi-tv-waiting-menu-dense" };
  if (count > 6) return { columns: 2, densityClass: "sampi-tv-waiting-menu-compact" };
  return { columns: 1, densityClass: "" };
};

const createTvWindow = async ({ name, width, height }) => {
  const partition = `smoke-tv-layout-${name}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const testSession = session.fromPartition(partition);

  testSession.webRequest.onBeforeRequest(
    {
      urls: API_URLS,
    },
    (_details, callback) => callback({ cancel: true })
  );

  return new BrowserWindow({
    width,
    height,
    show: false,
    backgroundColor: "#fcffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition,
    },
  });
};

const injectWaitingTickets = async (win, ticketCount) => {
  const grid = getWaitingGridMeta(ticketCount);
  const rows = Math.max(1, Math.ceil(ticketCount / grid.columns));

  await win.webContents.executeJavaScript(`
    (() => {
      const menu = document.querySelector(".sampi-tv-waiting-menu");
      const count = document.querySelector(".sampi-tv-waiting-head b");
      const list = document.querySelector(".sampi-tv-waiting-list");
      if (!menu || !count || !list) {
        throw new Error("TV waiting layout nodes missing");
      }

      menu.classList.remove("sampi-tv-waiting-menu-empty");
      menu.classList.add("sampi-tv-waiting-menu-active");
      menu.classList.remove(
        "sampi-tv-waiting-menu-grid",
        "sampi-tv-waiting-menu-compact",
        "sampi-tv-waiting-menu-dense",
        "sampi-tv-waiting-menu-ultra"
      );
      if (${ticketCount} > 6) {
        menu.classList.add("sampi-tv-waiting-menu-grid");
      }
      if (${JSON.stringify(grid.densityClass)}) {
        menu.classList.add(${JSON.stringify(grid.densityClass)});
      }
      count.textContent = String(${ticketCount});
      list.style.gridTemplateColumns =
        ${ticketCount} > 6 ? "repeat(${grid.columns}, minmax(0, 1fr))" : "";
      list.style.gridTemplateRows =
        ${ticketCount} > 6 ? "repeat(${rows}, minmax(0, 1fr))" : "";
      list.innerHTML = Array.from({ length: ${ticketCount} }, (_, index) => index + 1).map((value, index) => {
        const code = String(value).padStart(2, "0");
        return '<div class="sampi-tv-waiting-row ' +
          (index === 0 ? 'sampi-tv-waiting-row-next' : '') +
          '" style="--row-delay: ' + (260 + index * 70) + 'ms">' +
          '<span>' + code + '</span>' +
          (index === 0 ? '<small>Keyingi</small>' : '') +
          '</div>';
      }).join("");
    })();
  `);
};

const readLayoutMetrics = async (win) =>
  win.webContents.executeJavaScript(`
    (() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
        };
      };
      const inside = (child, parent, pad = 0) =>
        Boolean(child && parent) &&
        child.left >= parent.left - pad &&
        child.top >= parent.top - pad &&
        child.right <= parent.right + pad &&
        child.bottom <= parent.bottom + pad;
      const intersects = (a, b, pad = 0) =>
        Boolean(a && b) &&
        a.left < b.right + pad &&
        a.right > b.left - pad &&
        a.top < b.bottom + pad &&
        a.bottom > b.top - pad;
      const rows = [...document.querySelectorAll(".sampi-tv-waiting-row")].map((el) => {
        const box = el.getBoundingClientRect();
        const children = [...el.children]
          .map((child) => {
            const childBox = child.getBoundingClientRect();
            return {
              top: childBox.top,
              bottom: childBox.bottom,
              left: childBox.left,
              right: childBox.right,
              width: childBox.width,
              height: childBox.height,
            };
          })
          .filter((child) => child.width > 0 && child.height > 0);
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          height: box.height,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          childrenInside: children.every((child) =>
            child.left >= box.left - 1 &&
            child.right <= box.right + 1 &&
            child.top >= box.top - 1 &&
            child.bottom <= box.bottom + 1
          ),
        };
      });
      const title = document.querySelector(".sampi-tv-standby-title");
      const waitingList = document.querySelector(".sampi-tv-waiting-list");
      const waitingMenu = document.querySelector(".sampi-tv-waiting-menu");
      const currentCard = document.querySelector(".sampi-tv-current-card");
      const audioButton = rect(".sampi-tv-audio-button");
      const shell = document.querySelector(".sampi-tv-minimal-shell");
      const runningAnimations = (shell ? shell.getAnimations({ subtree: true }) : [])
        .filter((animation) => ["pending", "running"].includes(animation.playState))
        .map((animation) => {
          const target = animation.effect && animation.effect.target;
          return {
            name: animation.animationName || "",
            playState: animation.playState,
            target:
              (target && typeof target.className === "string" && target.className) ||
              (target && target.tagName) ||
              "",
          };
        });
      return {
        tvLockEnabled:
          document.documentElement.classList.contains("sampi-tv-lock") &&
          document.body.classList.contains("sampi-tv-lock"),
        viewport: { width: innerWidth, height: innerHeight },
        page: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        },
        currentCard: rect(".sampi-tv-current-card"),
        title: rect(".sampi-tv-standby-title"),
        audioButton,
        waitingMenu: rect(".sampi-tv-waiting-menu"),
        waitingList: rect(".sampi-tv-waiting-list"),
        rows,
        rowCount: rows.length,
        waitingBadgeText: document.querySelector(".sampi-tv-waiting-head b")?.textContent.trim() || "",
        titleInsideCard: inside(rect(".sampi-tv-standby-title"), rect(".sampi-tv-current-card"), 1),
        titleTextFits:
          title ? title.scrollWidth <= title.clientWidth + 1 : false,
        waitingListFits:
          waitingList ? waitingList.scrollHeight <= waitingList.clientHeight + 1 : false,
        waitingMenuInsideViewport:
          waitingMenu ? waitingMenu.getBoundingClientRect().bottom <= innerHeight + 1 : false,
        currentCardInsideViewport:
          currentCard ? currentCard.getBoundingClientRect().bottom <= innerHeight + 1 : false,
        rowsFitWidth: rows.every((row) => row.scrollWidth <= row.clientWidth + 1),
        rowsFitHeight: rows.every((row) => row.childrenInside),
        rowsClearAudioButton:
          !audioButton || rows.every((row) => !intersects(row, audioButton, 1)),
        runningAnimations,
        noRunningAnimations: runningAnimations.length === 0,
        noPageOverflow:
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.documentElement.scrollHeight <= innerHeight + 1,
      };
    })();
  `);

const captureViewport = async (viewport) => {
  const win = await createTvWindow(viewport);

  await win.loadURL(`${TEST_ORIGIN}/login?layout=${Date.now()}`);
  await win.webContents.executeJavaScript(`
    localStorage.setItem("sampi_token", "smoke-tv-layout-token");
    localStorage.setItem("sampi_user", JSON.stringify({
      id: "smoke-tv-layout",
      name: "TV Layout Smoke",
      role: "tv"
    }));
    sessionStorage.clear();
  `);
  await win.loadURL(`${TEST_ORIGIN}/tv/lor?layout=${Date.now()}`);
  await delay(1300);
  await injectWaitingTickets(win, viewport.ticketCount);
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  `);
  await delay(650);

  const metrics = await readLayoutMetrics(win);
  const image = await win.webContents.capturePage();
  const screenshotPath = path.join(outputDir, `${viewport.name}.png`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(screenshotPath, image.toPNG());
  win.close();

  const failed = [
    ["tvLockEnabled", metrics.tvLockEnabled],
    ["allRowsRendered", metrics.rowCount === viewport.ticketCount],
    ["waitingBadgeMatches", metrics.waitingBadgeText === String(viewport.ticketCount)],
    ["titleInsideCard", metrics.titleInsideCard],
    ["titleTextFits", metrics.titleTextFits],
    ["waitingListFits", metrics.waitingListFits],
    ["waitingMenuInsideViewport", metrics.waitingMenuInsideViewport],
    ["currentCardInsideViewport", metrics.currentCardInsideViewport],
    ["rowsFitWidth", metrics.rowsFitWidth],
    ["rowsFitHeight", metrics.rowsFitHeight],
    ["rowsClearAudioButton", metrics.rowsClearAudioButton],
    ["noRunningAnimations", metrics.noRunningAnimations],
    ["noPageOverflow", metrics.noPageOverflow],
  ].filter(([, ok]) => !ok);

  if (failed.length) {
    throw new Error(
      `${viewport.name} layout failed: ${JSON.stringify(
        { failed: failed.map(([name]) => name), metrics, screenshotPath },
        null,
        2
      )}`
    );
  }

  return { ...viewport, screenshotPath, metrics };
};

const run = async () => {
  await app.whenReady();
  const results = [];

  for (const viewport of viewports) {
    results.push(await captureViewport(viewport));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        screenshots: results.map(({ name, width, height, ticketCount, screenshotPath }) => ({
          name,
          width,
          height,
          ticketCount,
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
