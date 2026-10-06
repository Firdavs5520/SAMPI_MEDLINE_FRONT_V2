// TV navbat chaqiruvi uchun o'zbekcha ovozli fayllarni yaratadi:
//   public/audio/queue/15.mp3 -> "O'n beshinchi raqam, navbatingiz keldi."
//
// Ishga tushirish:  node scripts/generate-queue-voice.mjs [ovoz] [oxirgi_raqam] [tezlik]
//   ovoz: uz-UZ-SardorNeural (erkak, standart) yoki uz-UZ-MadinaNeural (ayol)
//   tezlik: "-15%" (standart, sekinroq va aniqroq)
// Microsoft Edge neyron ovozidan foydalanadi (internet kerak, faqat yaratishda).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "edge-tts-universal";
import { toUzbekOrdinal } from "../src/utils/uzbekNumbers.js";

const VOICE = process.argv[2] || "uz-UZ-SardorNeural";
const LAST_NUMBER = Number(process.argv[3] || 150);
const RATE = process.argv[4] || "-15%";
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio", "queue");

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Oddiy apostrof (') bilan ovoz "o'n" ni "on" deb o'qiydi. O'zbek lotin
// yozuvidagi to'g'ri belgi - ʻ (U+02BB): "oʻn", "toʻrt", "toʻqqiz".
const toSpeechText = (text) => text.replace(/([oOgG])'/g, "$1ʻ");

mkdirSync(outDir, { recursive: true });

for (let number = 1; number <= LAST_NUMBER; number += 1) {
  const text = toSpeechText(`${capitalize(toUzbekOrdinal(number))} raqam, navbatingiz keldi.`);
  const result = await new EdgeTTS(text, VOICE, { rate: RATE }).synthesize();
  writeFileSync(join(outDir, `${number}.mp3`), Buffer.from(await result.audio.arrayBuffer()));
  console.log(`${number}: ${text}`);
}
