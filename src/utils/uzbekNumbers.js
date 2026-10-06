// O'zbekcha sonlar: 15 -> "o'n besh", tartib son 15 -> "o'n beshinchi".
const UNITS = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];

export const toUzbekCardinal = (value) => {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0 || number > 999) return String(value);

  const hundreds = Math.floor(number / 100);
  const tens = Math.floor((number % 100) / 10);
  const units = number % 10;
  const words = [];

  if (hundreds) words.push(hundreds === 1 ? "yuz" : `${UNITS[hundreds]} yuz`);
  if (tens) words.push(TENS[tens]);
  if (units) words.push(UNITS[units]);

  return words.join(" ");
};

// Tartib son qo'shimchasi oxirgi so'zga qo'shiladi: unli bilan tugasa "-nchi"
// (ikkinchi, yigirmanchi), undosh bilan tugasa "-inchi" (beshinchi).
// "ellik" -> "elliginchi" (k jarangli g ga o'tadi).
export const toUzbekOrdinal = (value) => {
  const cardinal = toUzbekCardinal(value);
  const words = cardinal.split(" ");
  const last = words.pop();

  let ordinal;
  if (last === "ellik") {
    ordinal = "elliginchi";
  } else if (/[aeiou]$/.test(last)) {
    ordinal = `${last}nchi`;
  } else {
    ordinal = `${last}inchi`;
  }

  return [...words, ordinal].join(" ");
};
