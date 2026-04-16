/**
 * Returnerar svenska röda dagar (helgdagar) för ett givet år som
 * en map från ISO-datum (YYYY-MM-DD) till namn.
 *
 * Använder Anonymous Gregorian + korrektionstabell för påskdagen.
 * Midsommarafton = fredagen före midsommardagen (lördag 20-26 juni).
 */
export function getRödaDagar(år: number): Record<string, string> {
  // Beräkna påskdagen
  const a = år % 19, b = Math.floor(år / 100), c = år % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const månad = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  let påsk = new Date(år, månad - 1, dag);
  while (påsk.getDay() !== 0) påsk.setDate(påsk.getDate() + 1);

  const addD = (dt: Date, n: number) => { const r = new Date(dt); r.setDate(r.getDate() + n); return r; };
  const fm = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

  const midsommarLör = new Date(år, 5, 20);
  while (midsommarLör.getDay() !== 6) midsommarLör.setDate(midsommarLör.getDate() + 1);
  const midsommarAfton = addD(midsommarLör, -1);

  return {
    [`${år}-01-01`]: "Nyårsdagen",
    [`${år}-01-06`]: "Trettondedag jul",
    [fm(addD(påsk, -2))]: "Långfredag",
    [fm(påsk)]: "Påskdagen",
    [fm(addD(påsk, 1))]: "Annandag påsk",
    [`${år}-05-01`]: "Första maj",
    [fm(addD(påsk, 39))]: "Kristi himmelsfärd",
    [`${år}-06-06`]: "Nationaldagen",
    [fm(midsommarAfton)]: "Midsommarafton",
    [fm(addD(påsk, 49))]: "Pingstdagen",
    [`${år}-12-24`]: "Julafton",
    [`${år}-12-25`]: "Juldagen",
    [`${år}-12-26`]: "Annandag jul",
    [`${år}-12-31`]: "Nyårsafton",
  };
}

/**
 * Förväntade arbetsminuter för en månad: vardagar (mån-fre) som
 * INTE är röda dagar, gånger 8 timmar.
 */
export function expectedWorkMinutes(year: number, month0: number): number {
  const röda = getRödaDagar(year);
  const dagarIMånad = new Date(year, month0 + 1, 0).getDate();
  let arbetsdagar = 0;
  for (let d = 1; d <= dagarIMånad; d++) {
    const wd = new Date(year, month0, d).getDay(); // 0=sön, 6=lör
    if (wd === 0 || wd === 6) continue;
    const key = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (röda[key]) continue;
    arbetsdagar++;
  }
  return arbetsdagar * 8 * 60;
}
