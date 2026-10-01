const TASHKENT_UTC_OFFSET_HOURS = 5;
const TASHKENT_UTC_OFFSET_MS = TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const toTashkentYmd = (date = new Date()) =>
  new Date(date.getTime() + TASHKENT_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

const parseTime = (value, fallback) => {
  const match = TIME_PATTERN.exec(String(value || "").trim()) || TIME_PATTERN.exec(fallback);
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

// Backenddagi cashierSettingsService.getCurrentShiftDate bilan bir xil qoida:
// smena yarim tundan o'tsa (masalan 08:00 - 02:00), 00:00 - 02:00 oralig'ida
// joriy smena sanasi hali kechagi kun hisoblanadi.
export const getCurrentShiftYmd = (
  { shiftStartTime = "08:00", shiftEndTime = "02:00" } = {},
  now = new Date()
) => {
  const start = parseTime(shiftStartTime, "08:00");
  const end = parseTime(shiftEndTime, "02:00");
  const calendarDate = toTashkentYmd(now);
  const [year, month, day] = calendarDate.split("-").map(Number);
  const endsNextDay =
    end.hour < start.hour || (end.hour === start.hour && end.minute <= start.minute);
  const previousShiftEnd =
    Date.UTC(year, month - 1, day - 1 + (endsNextDay ? 1 : 0), end.hour, end.minute) -
    TASHKENT_UTC_OFFSET_MS;

  if (now.getTime() < previousShiftEnd) {
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  }

  return calendarDate;
};
