const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sampiDesktop", {
  printReceiptHtml: (html, options = {}) =>
    ipcRenderer.invoke("sampi:print-receipt-html", html, options),
});

const injectSilentReceiptPrint = () => {
  const source = `
    (() => {
      if (window.__sampiSilentReceiptPrintInstalled) return;
      window.__sampiSilentReceiptPrintInstalled = true;

      const nativePrint = window.print.bind(window);

      const isReceiptDocument = () => {
        const title = String(document.title || "").toLowerCase();
        const text = String(document.body?.innerText || "");
        return (
          title.includes("chek") ||
          title.includes("navbat") ||
          text.includes("SAMPI MEDLINE") ||
          text.includes("Navbat raqami:")
        );
      };

      const notifyAfterPrint = () => {
        setTimeout(() => {
          window.dispatchEvent(new Event("afterprint"));
        }, 50);
      };

      window.print = function sampiSilentReceiptPrint() {
        if (
          isReceiptDocument() &&
          window.sampiDesktop &&
          typeof window.sampiDesktop.printReceiptHtml === "function"
        ) {
          const html = "<!doctype html>\\n" + document.documentElement.outerHTML;
          window.sampiDesktop.printReceiptHtml(html).then(notifyAfterPrint).catch(() => {
            nativePrint();
          });
          return;
        }

        nativePrint();
      };
    })();
  `;

  const install = () => {
    const target = document.documentElement || document.head || document.body;
    if (!target) return false;

    const script = document.createElement("script");
    script.textContent = source;
    target.appendChild(script);
    script.remove();
    return true;
  };

  if (!install()) {
    window.addEventListener("DOMContentLoaded", install, { once: true });
  }
};

injectSilentReceiptPrint();
