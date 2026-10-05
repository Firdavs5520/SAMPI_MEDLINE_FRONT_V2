const fs = require("fs");
const path = require("path");

// Navbat chekidagi "Golos Text" shrifti ilova ichida keladi (SIL Open Font License).
// Ilgari u har chekda Google Fonts'dan yuklanardi va bu chekni ~1-3 soniyaga kechiktirardi.
// Shrift fayllari o'sha-o'sha, shuning uchun chek ko'rinishi o'zgarmaydi.
const GOOGLE_FONTS_LINK = /<link\b[^>]*fonts\.googleapis\.com[^>]*>/gi;
const FONT_SUBSETS = [
  { file: "golos-text-cyrillic-ext.woff2", unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  { file: "golos-text-cyrillic.woff2", unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  { file: "golos-text-latin-ext.woff2", unicodeRange: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  { file: "golos-text-latin.woff2", unicodeRange: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }
];
let cachedFontCss = null;

const getReceiptFontCss = () => {
  if (cachedFontCss !== null) return cachedFontCss;
  try {
    cachedFontCss = FONT_SUBSETS.map(({ file, unicodeRange }) => {
      const data = fs.readFileSync(path.join(__dirname, "fonts", file)).toString("base64");
      // Variable shrift: bitta fayl 400-700 qalinliklarning hammasini beradi (Google ham shunday).
      return (
        `@font-face{font-family:"Golos Text";font-style:normal;font-weight:400 700;font-display:block;` +
        `src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${unicodeRange};}`
      );
    }).join("");
  } catch (error) {
    console.warn("Receipt fonts could not be loaded:", error.message);
    cachedFontCss = "";
  }
  return cachedFontCss;
};

// Google Fonts havolasini ichki shrift bilan almashtiradi. Shrift topilmasa HTML o'zgarmaydi.
const inlineReceiptFonts = (html) => {
  const source = String(html || "");
  if (!GOOGLE_FONTS_LINK.test(source)) return source;
  GOOGLE_FONTS_LINK.lastIndex = 0;
  const css = getReceiptFontCss();
  if (!css) return source;
  return source.replace(GOOGLE_FONTS_LINK, () => `<style>${css}</style>`);
};

module.exports = { inlineReceiptFonts, getReceiptFontCss };
