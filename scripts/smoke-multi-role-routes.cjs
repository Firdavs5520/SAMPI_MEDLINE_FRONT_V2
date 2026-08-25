const { app, BrowserWindow, session } = require("electron");

const TEST_ORIGIN = process.env.SAMPI_SMOKE_ORIGIN || "http://127.0.0.1:4174";
const EXPECTED_VERSION = process.env.npm_package_version || "1.0.4";
const WAIT_MS = 1200;

const API_URLS = [
  "https://sampi-medline-back-v2.onrender.com/*",
  "http://localhost:5000/*",
];

const cases = [
  {
    name: "cashier-pc",
    path: "/cashier/lor-queue",
    user: {
      id: "smoke-cashier",
      name: "Cashier Smoke",
      role: "cashier",
    },
    expectedText: ["LOR navbat", "Navbat cheki chiqarish"],
    shouldShowVersion: true,
  },
  {
    name: "nurse-pc",
    path: "/nurse",
    user: {
      id: "smoke-nurse",
      name: "Nurse Smoke",
      role: "nurse",
    },
    expectedText: ["Hamshira paneli", "Dorilar va xizmatlar tanlash"],
    shouldShowVersion: true,
  },
  {
    name: "lor-pc",
    path: "/lor/checks",
    user: {
      id: "smoke-lor",
      name: "LOR Smoke",
      role: "lor",
    },
    sessionSetup: `
      sessionStorage.setItem("sampi_lor_identity", "lor1");
      sessionStorage.setItem("sampi_lor_doctor", JSON.stringify({
        id: "64f000000000000000000001",
        name: "LOR Smoke"
      }));
    `,
    expectedText: ["Mening cheklarim", "Tanlangan LOR"],
    shouldShowVersion: true,
  },
  {
    name: "tv-screen",
    path: "/tv/lor",
    user: {
      id: "smoke-tv",
      name: "TV Smoke",
      role: "tv",
    },
    expectedText: ["Navbatingizni kuting", "LOR"],
    shouldShowVersion: false,
  },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createWindow = async (name) => {
  const partition = `smoke-multi-role-${name}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const testSession = session.fromPartition(partition);

  testSession.webRequest.onBeforeRequest(
    {
      urls: API_URLS,
    },
    (_details, callback) => callback({ cancel: true })
  );

  const win = new BrowserWindow({
    width: name === "tv-screen" ? 1920 : 1366,
    height: name === "tv-screen" ? 1080 : 768,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition,
    },
  });

  return win;
};

const readPageState = async (win, expectedText) =>
  win.webContents.executeJavaScript(`
    (() => {
      const bodyText = document.body.innerText || "";
      const expectedVersion = "v${EXPECTED_VERSION}";
      return {
        url: location.href,
        role: JSON.parse(localStorage.getItem("sampi_user") || "{}").role || "",
        lorIdentity: sessionStorage.getItem("sampi_lor_identity") || "",
        hasVersion: bodyText.includes(expectedVersion),
        versionBadgeCount: [...document.querySelectorAll("body *")]
          .filter((el) => el.textContent && el.textContent.trim() === expectedVersion)
          .length,
        expectedTextMatches: ${JSON.stringify(expectedText)}.filter((text) =>
          bodyText.includes(text)
        ),
        bodyText: bodyText.slice(0, 500),
      };
    })();
  `);

const runCase = async (testCase) => {
  const win = await createWindow(testCase.name);

  await win.loadURL(`${TEST_ORIGIN}/login?smoke=${Date.now()}`);
  await win.webContents.executeJavaScript(`
    localStorage.setItem("sampi_token", "smoke-token-${testCase.name}");
    localStorage.setItem("sampi_user", JSON.stringify(${JSON.stringify(testCase.user)}));
    sessionStorage.clear();
    ${testCase.sessionSetup || ""}
  `);
  await win.loadURL(`${TEST_ORIGIN}${testCase.path}?smoke=${Date.now()}`);
  await delay(WAIT_MS);

  const state = await readPageState(win, testCase.expectedText);
  win.close();

  if (!state.url.includes(testCase.path)) {
    throw new Error(`${testCase.name} wrong route: ${JSON.stringify(state)}`);
  }

  if (state.role !== testCase.user.role) {
    throw new Error(`${testCase.name} role leaked or missing: ${JSON.stringify(state)}`);
  }

  if (testCase.shouldShowVersion && state.versionBadgeCount !== 1) {
    throw new Error(`${testCase.name} expected one version badge: ${JSON.stringify(state)}`);
  }

  if (!testCase.shouldShowVersion && (state.hasVersion || state.versionBadgeCount !== 0)) {
    throw new Error(`${testCase.name} should hide version badge: ${JSON.stringify(state)}`);
  }

  if (!state.expectedTextMatches.length) {
    throw new Error(`${testCase.name} expected page text missing: ${JSON.stringify(state)}`);
  }

  return {
    name: testCase.name,
    path: testCase.path,
    role: state.role,
    versionBadgeCount: state.versionBadgeCount,
    expectedTextMatches: state.expectedTextMatches,
    lorIdentity: state.lorIdentity,
  };
};

const run = async () => {
  await app.whenReady();
  const results = await Promise.all(cases.map(runCase));

  console.log(
    JSON.stringify(
      {
        ok: true,
        expectedVersion: EXPECTED_VERSION,
        sessions: results,
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
