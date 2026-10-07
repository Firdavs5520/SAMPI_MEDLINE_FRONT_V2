import { useEffect, useMemo, useRef, useState } from "react";

const DURATION_MS = 650;
const FLASH_MS = 900;

// "172,000 so'm" -> { prefix: "", number: 172000, sep: ",", suffix: " so'm" }.
// Kasr qismli yoki raqamsiz matn animatsiyasiz ko'rsatiladi.
const parseNumberToken = (text) => {
  const match = /\d[\d\s,.\u00a0\u202f]*\d|\d/.exec(text);
  if (!match) return null;
  const token = match[0];
  if (/[.,]\d{1,2}$/.test(token) && !/[.,]\d{3}$/.test(token)) return null;
  const digits = token.replace(/\D/g, "");
  if (!digits || digits.length > 15) return null;
  const sep = (/[^\d]/.exec(token) || [""])[0];
  // Faqat to'g'ri guruhlangan son (1 234 567); sana ("07.10.2026") va shunga o'xshashlar emas.
  if (sep) {
    const groups = token.split(sep);
    const validGrouping =
      groups.every((group) => /^\d+$/.test(group)) &&
      groups[0].length <= 3 &&
      groups.slice(1).every((group) => group.length === 3);
    if (!validGrouping) return null;
  }
  return {
    prefix: text.slice(0, match.index),
    number: Number(digits),
    sep,
    suffix: text.slice(match.index + token.length)
  };
};

const formatGrouped = (number, sep) =>
  sep ? String(number).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(number);

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Raqam 0 dan (keyin oldingi qiymatdan) yangi qiymatgacha "sanalib" chiqadi;
// qiymat o'zgarganda qisqa yashil "yonib o'chish" bo'ladi.
function AnimatedValue({ value }) {
  const text = value === null || value === undefined ? "" : String(value);
  const parsed = useMemo(() => parseNumberToken(text), [text]);
  const target = parsed ? parsed.number : null;
  const [shown, setShown] = useState(0);
  const [flash, setFlash] = useState(false);
  const fromRef = useRef(0);
  const mountedOnceRef = useRef(false);

  useEffect(() => {
    if (target === null) return undefined;
    const from = fromRef.current;
    const changed = mountedOnceRef.current && from !== target;
    let frame = 0;
    let flashTimer = 0;
    const startedAt = performance.now();

    const step = (time) => {
      const progress = Math.min(1, (time - startedAt) / DURATION_MS);
      const current = Math.round(from + (target - from) * easeOutCubic(progress));
      // Yarim yo'lda yangi qiymat kelsa, keyingi animatsiya shu joydan davom etadi.
      fromRef.current = current;
      setShown(current);
      if (progress < 1) {
        frame = window.requestAnimationFrame(step);
        return;
      }
      if (changed) {
        setFlash(true);
        flashTimer = window.setTimeout(() => setFlash(false), FLASH_MS);
      }
    };

    frame = window.requestAnimationFrame(step);
    mountedOnceRef.current = true;
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(flashTimer);
    };
  }, [target]);

  if (!parsed) return text;

  return (
    <span className={`sx-num ${flash ? "sx-num-flash" : ""}`}>
      {parsed.prefix}
      {formatGrouped(shown, parsed.sep)}
      {parsed.suffix}
    </span>
  );
}

export default AnimatedValue;
