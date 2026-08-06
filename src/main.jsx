import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./index.css";

const VERSION_NOTICE_ID = "sampi-version-toast";
const VERSION_NOTICE_HIDE_MS = 6200;
const VERSION_UPDATE_CHECK_MS = 5 * 60 * 1000;
let versionNoticeTimer;

const showVersionNotice = ({ activated = false } = {}) => {
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
    text.textContent = activated
      ? "Ekran tinch ishlashda davom etadi"
      : "Keyingi refreshda avtomatik yangilanadi";
  }

  const isTvScreen = window.location.pathname.startsWith("/tv");
  notice.className = `sampi-version-toast${isTvScreen ? " sampi-version-toast-tv" : ""}`;

  window.requestAnimationFrame(() => notice.classList.add("sampi-version-toast-show"));
  window.clearTimeout(versionNoticeTimer);
  versionNoticeTimer = window.setTimeout(() => {
    notice.classList.remove("sampi-version-toast-show");
  }, VERSION_NOTICE_HIDE_MS);
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    if (!import.meta.env.PROD) return;

    try {
      let hadController = Boolean(navigator.serviceWorker.controller);
      const registration = await navigator.serviceWorker.register("/sw.js");

      const watchInstallingWorker = (worker) => {
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showVersionNotice();
          }
        });
      };

      if (registration.waiting && navigator.serviceWorker.controller) {
        showVersionNotice();
      }

      registration.addEventListener("updatefound", () => {
        watchInstallingWorker(registration.installing);
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController) {
          showVersionNotice({ activated: true });
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
