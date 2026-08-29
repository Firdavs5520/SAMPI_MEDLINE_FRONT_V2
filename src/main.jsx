import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./index.css";

const VERSION_NOTICE_ID = "sampi-version-toast";
const VERSION_NOTICE_HIDE_MS = 6200;
const VERSION_UPDATE_CHECK_MS = 60 * 1000;
const INDEX_VERSION_CHECK_MS = 60 * 1000;
const VERSION_AUTO_RELOAD_DELAY_MS = 1800;
let versionNoticeTimer;
let versionReloadTimer;
let currentAssetSignature = "";
let indexVersionWatcherStarted = false;

const isTvScreenPath = () => window.location.pathname.startsWith("/tv");

const isDesktopApp = () => {
  try {
    return Boolean(window.sampiDesktop) || /Electron\//i.test(window.navigator.userAgent || "");
  } catch {
    return false;
  }
};

const shouldAutoReloadForVersion = () => isTvScreenPath() || isDesktopApp();

const normalizeAssetUrl = (value) => {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
};

const getAssetSignatureFromDocument = (documentLike) =>
  [...documentLike.querySelectorAll('script[src], link[rel="stylesheet"][href]')]
    .map((node) => normalizeAssetUrl(node.getAttribute("src") || node.getAttribute("href")))
    .filter((value) => value.includes("/assets/"))
    .sort()
    .join("|");

const getAssetSignatureFromHtml = (html) => {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  return getAssetSignatureFromDocument(parsedDocument);
};

const scheduleVersionReload = () => {
  if (!shouldAutoReloadForVersion() || versionReloadTimer) return;

  versionReloadTimer = window.setTimeout(() => {
    window.location.reload();
  }, VERSION_AUTO_RELOAD_DELAY_MS);
};

const showVersionNotice = ({ activated = false, autoReload = false } = {}) => {
  if (typeof document === "undefined") return;

  let notice = document.getElementById(VERSION_NOTICE_ID);
  if (!notice) {
    notice = document.createElement("div");
    notice.id = VERSION_NOTICE_ID;
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = `
      <div class="sampi-version-toast-icon">SM</div>
      <div class="sampi-version-toast-copy">
        <strong data-version-title>Yangi versiya tayyor</strong>
        <span data-version-text>Keyingi refreshda avtomatik yangilanadi</span>
      </div>
    `;
    document.body.appendChild(notice);
  }

  const title = notice.querySelector("[data-version-title]");
  const text = notice.querySelector("[data-version-text]");
  if (title) {
    title.textContent = activated ? "Yangi versiya faollashdi" : "Yangi versiya tayyor";
  }
  if (text) {
    const autoReloadText = isTvScreenPath()
      ? "TV ekrani o'zi yangilanmoqda"
      : "Ilova o'zi yangilanmoqda";
    text.textContent = autoReload
      ? autoReloadText
      : activated
        ? "Ekran tinch ishlashda davom etadi"
        : "Keyingi refreshda avtomatik yangilanadi";
  }

  const isTvScreen = isTvScreenPath();
  notice.className = `sampi-version-toast${isTvScreen ? " sampi-version-toast-tv" : ""}`;

  window.requestAnimationFrame(() => notice.classList.add("sampi-version-toast-show"));
  window.clearTimeout(versionNoticeTimer);
  versionNoticeTimer = window.setTimeout(() => {
    notice.classList.remove("sampi-version-toast-show");
  }, VERSION_NOTICE_HIDE_MS);
};

const handleNewVersionReady = ({ activated = false } = {}) => {
  const autoReload = shouldAutoReloadForVersion();
  showVersionNotice({ activated, autoReload });

  if (autoReload) {
    scheduleVersionReload();
  }
};

const checkIndexVersion = async () => {
  if (document.visibilityState !== "visible") return;

  if (!currentAssetSignature) {
    currentAssetSignature = getAssetSignatureFromDocument(document);
  }

  const url = new URL("/index.html", window.location.origin);
  url.searchParams.set("__sampi_update_check", Date.now().toString());

  const response = await fetch(url.href, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  if (!response.ok) return;

  const nextAssetSignature = getAssetSignatureFromHtml(await response.text());
  if (
    currentAssetSignature &&
    nextAssetSignature &&
    nextAssetSignature !== currentAssetSignature
  ) {
    currentAssetSignature = nextAssetSignature;
    handleNewVersionReady();
  }
};

const startIndexVersionWatcher = () => {
  if (indexVersionWatcherStarted) return;

  indexVersionWatcherStarted = true;
  currentAssetSignature = getAssetSignatureFromDocument(document);

  const runCheck = () => {
    checkIndexVersion().catch(() => {});
  };

  window.setInterval(runCheck, INDEX_VERSION_CHECK_MS);
  document.addEventListener("visibilitychange", runCheck);
  window.addEventListener("online", runCheck);
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    if (!import.meta.env.PROD) return;

    try {
      startIndexVersionWatcher();
      let hadController = Boolean(navigator.serviceWorker.controller);
      const registration = await navigator.serviceWorker.register("/sw.js");

      const watchInstallingWorker = (worker) => {
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            handleNewVersionReady();
          }
        });
      };

      if (registration.waiting && navigator.serviceWorker.controller) {
        handleNewVersionReady();
      }

      registration.addEventListener("updatefound", () => {
        watchInstallingWorker(registration.installing);
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController) {
          handleNewVersionReady({ activated: true });
        }
        hadController = true;
      });

      const checkForUpdate = () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      };

      window.setInterval(checkForUpdate, VERSION_UPDATE_CHECK_MS);
      document.addEventListener("visibilitychange", checkForUpdate);
    } catch {
      // The app should keep working even when a TV browser blocks service workers.
      startIndexVersionWatcher();
    }
  });
} else {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      startIndexVersionWatcher();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
