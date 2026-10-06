// Xatoni aynan qaysi maydonda ekanini ko'rsatish.
//
// Ishlatish:
//   1. Maydon o'ramiga data-field="nomi" qo'yiladi (masalan <div data-field="patient">).
//   2. Tekshiruvda: throw fieldError("patient", "Bemor F.I.O ni kiriting");
//   3. catch ichida: if (!showFieldErrorFrom(err)) setError(extractErrorMessage(err));
//
// Natija: sahifa o'sha maydonga aylanadi, maydon qizil bo'lib silkinadi, xato matni
// uning ostida chiqadi va kursor maydonga tushadi. Foydalanuvchi maydonga yozishi
// yoki uni bosishi bilan xato o'zi yo'qoladi.

export class FieldError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "FieldError";
    this.field = field;
  }
}

export const fieldError = (field, message) => new FieldError(field, message);

const FOCUSABLE = "input:not([type=hidden]), textarea, select, button";
const SHAKE_MS = 500;

const clearFieldError = (element) => {
  element.removeAttribute("data-field-error");
  element.removeAttribute("data-field-shake");
};

export const showFieldError = (field, message, { root = document } = {}) => {
  if (typeof document === "undefined" || !field) return false;

  const element = root.querySelector(`[data-field="${field}"]`);
  if (!element) return false;

  element.setAttribute("data-field-error", message || "");
  // Animatsiya har safar qaytadan boshlanishi uchun atributni olib, qayta qo'yamiz.
  element.removeAttribute("data-field-shake");
  void element.offsetWidth;
  element.setAttribute("data-field-shake", "");
  window.setTimeout(() => element.removeAttribute("data-field-shake"), SHAKE_MS);

  element.scrollIntoView({ block: "center", behavior: "smooth" });
  const focusTarget = element.matches(FOCUSABLE) ? element : element.querySelector(FOCUSABLE);
  focusTarget?.focus({ preventScroll: true });

  if (!element.__sampiFieldErrorListener) {
    const clear = () => clearFieldError(element);
    element.addEventListener("input", clear, true);
    element.addEventListener("change", clear, true);
    element.addEventListener("click", clear, true);
    element.__sampiFieldErrorListener = clear;
  }

  return true;
};

export const showFieldErrorFrom = (error) =>
  error instanceof FieldError ? showFieldError(error.field, error.message) : false;
