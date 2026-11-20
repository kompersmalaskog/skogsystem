// Rastminuter ur sekunder — EN regel: närmaste hela minut, halv minut uppåt (1139 s = 18,98 min → 19).
// Importen (skogsmaskin_import_version_6.py rast_min_fran_sek) räknar likadant; båda testas mot lib/__fixtures__/rast_avrundning.json.
// Förut trunkerade importen (int(1139 / 60) = 18) medan /api/mom-import avrundade (19), så samma dag kunde få olika rast beroende på
// vem som skrev raden. Trunkering vore dessutom snett: den räknar rasten för kort varje dag och arbetstiden för lång.
// Saknat eller ogiltigt värde är 0, aldrig NaN.
export function rastMinFranSek(sek: number | null | undefined): number {
  const s = Number(sek);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.floor((s + 30) / 60);
}
