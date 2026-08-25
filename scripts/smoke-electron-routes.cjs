const { app, BrowserWindow, session } = require("electron");

const TEST_ORIGIN = process.env.SAMPI_SMOKE_ORIGIN || "http://127.0.0.1:4174";
const EXPECTED_VERSION = process.env.npm_package_version || "1.0.4";

const createWindow = async () => {
  const partition = `smoke-${Date.now()}`;
  const testSession = session.fromPartition(partition);

  testSession.webRequest.onBeforeRequest(
    {
      urls: [
        "https://sampi-medline-back-v2.onrender.com/*",
        "http://localhost:5000/*",
      ],
    },
    (_details, callback) => callback({ cancel: true })
  );

  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition,
    },
  });

  return win;
};

const getRouteState = async (win) =>
  win.webContents.executeJavaScript(`
    (() => ({
      url: location.href,
      hasVersion: document.body.innerText.includes("v${EXPECTED_VERSION}"),
      versionBadgeCount: [...document.querySelectorAll("body *")]
        .filter((el) => el.textContent && el.textContent.trim() === "v${EXPECTED_VERSION}")
        .length,
      hasTvCopy: document.body.innerText.includes("Navbatingizni kuting") ||
        document.body.innerText.includes("Kassaga yaqinlashing") ||
        document.body.innerText.includes("LOR navbat"),
      text: document.body.innerText.slice(0, 300),
    }))();
  `);

const run = async () => {
  await app.whenReady();
  const win = await createWindow();

  await win.loadURL(`${TEST_ORIGIN}/login?smoke=${Date.now()}`);
  await win.webContents.executeJavaScript(`
    localStorage.removeItem("sampi_token");
    localStorage.removeItem("sampi_user");
    sessionStorage.clear();
  `);
  await win.reload();
  await new Promise((resolve) => setTimeout(resolve, 700));
  const loginState = await getRouteState(win);

  if (!loginState.hasVersion || loginState.versionBadgeCount !== 1) {
    throw new Error(`Expected one version badge on login, got ${JSON.stringify(loginState)}`);
  }

  await win.webContents.executeJavaScript(`
    localStorage.setItem("sampi_token", "smoke-test-token");
    localStorage.setItem("sampi_user", JSON.stringify({
      id: "smoke-tv",
      name: "TV Smoke Test",
      role: "tv"
    }));
  `);
  await win.loadURL(`${TEST_ORIGIN}/tv/lor?smoke=${Date.now()}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const tvState = await getRouteState(win);

  if (tvState.hasVersion || tvState.versionBadgeCount !== 0) {
    throw new Error(`Expected no version badge on TV route, got ${JSON.stringify(tvState)}`);
  }

  if (!tvState.hasTvCopy) {
    throw new Error(`Expected TV route content, got ${JSON.stringify(tvState)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        expectedVersion: EXPECTED_VERSION,
        login: loginState,
        tv: tvState,
      },
      null,
      2
    )
  );

  win.close();
  app.quit();
};

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
