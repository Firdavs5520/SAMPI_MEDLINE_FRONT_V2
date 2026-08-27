const TASHKENT_UTC_OFFSET_HOURS = 5;

export const toTashkentYmd = (date = new Date()) =>
  new Date(date.getTime() + TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
