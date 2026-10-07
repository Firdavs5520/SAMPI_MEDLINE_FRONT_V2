// Yangi versiya chiqqanda butun ekranni egallaydigan premium animatsiya:
//   1) "Yangi versiya tayyor" — Hozir yangilash / Keyinroq (TV da o'zi yangilanadi);
//   2) yangilangandan keyin qisqa "Yangilandi" ekrani.
// React'dan tashqarida (main.jsx dan) chaqiriladi va to'g'ridan-to'g'ri body ga qo'shiladi:
// sahifa animatsiyalarining !important qoidalari bunga tegmaydi.

const SPLASH_ID = "sampi-version-splash";
const JUST_UPDATED_KEY = "sampi_just_updated";
const RELOAD_DELAY_MS = 1100;
const TV_RELOAD_DELAY_MS = 2600;
const UPDATED_VISIBLE_MS = 2600;
const EXIT_MS = 420;

const markup = ({ tv, mode, version }) => `
  <div class="sampi-vsplash-aurora" aria-hidden="true">
    <span></span><span></span><span></span>
  </div>
  <div class="sampi-vsplash-grid" aria-hidden="true"></div>
  <div class="sampi-vsplash-content">
    <div class="sampi-vsplash-mark" aria-hidden="true">
      <span class="sampi-vsplash-halo"></span>
      <span class="sampi-vsplash-halo sampi-vsplash-halo-2"></span>
      <span class="sampi-vsplash-ring"></span>
      <span class="sampi-vsplash-orbit"><i></i></span>
      <span class="sampi-vsplash-logo">
        ${
          mode === "updated"
            ? `<svg viewBox="0 0 24 24"><path class="sampi-vsplash-check" d="M5 12.5l4.5 4.5L19 7.5" /></svg>`
            : "SM"
        }
      </span>
    </div>
    <p class="sampi-vsplash-kicker">SAMPI MEDICINE</p>
    <h2 class="sampi-vsplash-title">${mode === "updated" ? "Yangilandi!" : "Yangi versiya tayyor"}</h2>
    <p class="sampi-vsplash-text" data-vsplash-text>${
      mode === "updated"
        ? `Tizim eng so'nggi versiyada ishlayapti${version ? ` · v${version}` : ""}`
        : tv
          ? "Ekran bir necha soniyada o'zi yangilanadi"
          : "Tizim yaxshilandi. Yangi imkoniyatlar uchun yangilang."
    }</p>
    <div class="sampi-vsplash-progress" aria-hidden="true"><span></span></div>
    ${
      mode === "prompt" && !tv
        ? `<div class="sampi-vsplash-actions">
            <button type="button" class="sampi-vsplash-primary" data-vsplash-reload>
              <span>Hozir yangilash</span>
            </button>
            <button type="button" class="sampi-vsplash-ghost" data-vsplash-later>Keyinroq</button>
          </div>`
        : ""
    }
  </div>
`;

let keyGuard = null;

// Ochiq turganda sahifa aylanmaydi: ostidagi sahifaning scroll bar'i animatsiya ustida ko'rinmaydi.
const OPEN_CLASS = "sampi-vsplash-open";

const removeSplash = (splash, { immediate = false } = {}) => {
  if (!splash) return;
  if (keyGuard) {
    window.removeEventListener("keydown", keyGuard, true);
    keyGuard = null;
  }
  const finish = () => {
    splash.remove();
    if (!document.getElementById(SPLASH_ID)) document.documentElement.classList.remove(OPEN_CLASS);
  };
  if (immediate) {
    finish();
    return;
  }
  splash.classList.add("is-leaving");
  window.setTimeout(finish, EXIT_MS);
};

const mountSplash = ({ tv, mode, version }) => {
  document.getElementById(SPLASH_ID)?.remove();
  const splash = document.createElement("div");
  splash.id = SPLASH_ID;
  splash.className = `sampi-vsplash sampi-vsplash-${mode}${tv ? " sampi-vsplash-tv" : ""}`;
  splash.setAttribute("role", mode === "prompt" ? "alertdialog" : "status");
  splash.setAttribute("aria-live", "assertive");
  splash.innerHTML = markup({ tv, mode, version });
  document.body.appendChild(splash);
  document.documentElement.classList.add(OPEN_CLASS);
  return splash;
};

const startReload = (splash, delay) => {
  try {
    window.sessionStorage.setItem(JUST_UPDATED_KEY, "1");
  } catch {
    // saqlanmasa ham yangilanadi, faqat "Yangilandi" ekrani chiqmaydi
  }
  splash.classList.add("is-updating");
  splash.style.setProperty("--vsplash-reload-ms", `${delay}ms`);
  const text = splash.querySelector("[data-vsplash-text]");
  if (text) text.textContent = "Yangilanmoqda…";
  window.setTimeout(() => window.location.reload(), delay);
};

// onLater: "Keyinroq" bosilsa kichik eslatma (toast) qoladi.
export const showVersionSplash = ({ tv = false, onLater } = {}) => {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(SPLASH_ID);
  if (existing?.classList.contains("sampi-vsplash-prompt")) return;

  const splash = mountSplash({ tv, mode: "prompt" });

  if (tv) {
    startReload(splash, TV_RELOAD_DELAY_MS);
    return;
  }

  const later = () => {
    removeSplash(splash);
    onLater?.();
  };

  // Oyna ochiq turganda Enter/Space sahifaga o'tmaydi (masalan, kassada chek chiqib ketmasin).
  keyGuard = (event) => {
    if (!["Enter", " ", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") later();
  };
  window.addEventListener("keydown", keyGuard, true);

  splash.querySelector("[data-vsplash-reload]")?.addEventListener("click", () => {
    if (keyGuard) {
      window.removeEventListener("keydown", keyGuard, true);
      keyGuard = null;
    }
    startReload(splash, RELOAD_DELAY_MS);
  });
  splash.querySelector("[data-vsplash-later]")?.addEventListener("click", later);
};

// Sahifa yangilangandan keyin bir marta "Yangilandi" ekrani.
export const showUpdatedSplashIfNeeded = ({ tv = false, version = "" } = {}) => {
  if (typeof document === "undefined") return;
  let justUpdated = false;
  try {
    justUpdated = window.sessionStorage.getItem(JUST_UPDATED_KEY) === "1";
    window.sessionStorage.removeItem(JUST_UPDATED_KEY);
  } catch {
    justUpdated = false;
  }
  if (!justUpdated) return;

  const splash = mountSplash({ tv, mode: "updated", version });
  const close = () => removeSplash(splash);
  splash.addEventListener("click", close);
  window.setTimeout(close, UPDATED_VISIBLE_MS);
};
