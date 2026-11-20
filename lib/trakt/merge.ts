// Generell sammanslagning av trakt-fält: envz vinner ENDAST där envz faktiskt har ett värde.
// Tom sträng, null, undefined och NaN räknas alla som "inget värde". Mergen nollar aldrig en
// kolumn och skriver aldrig över något TD-parsern hittade med ett tomt envz-fält. Detta är en
// generell regel — inga fältspecifika undantag (cert var bara första exemplet; fler fält
// kommer variera när VIDA varierar innehållet).

export function harVarde(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Slå ihop TD-parserns fält med envz-fält. Startar från TD och låter envz skriva över, men
 * bara där envz har ett värde. Nycklar som bara finns i det ena behålls.
 */
export function mergeFalt(
  td: Record<string, any>,
  envz: Record<string, any>,
): Record<string, any> {
  const ut: Record<string, any> = { ...td };
  for (const [k, v] of Object.entries(envz)) {
    if (harVarde(v)) ut[k] = v; // envz vinner bara där den har ett värde
  }
  return ut;
}

// === Executor-gate ===
// Envz från VIDA ska ha vårt org.nr som Executor. Matchar det inte → leveransen är någon
// annan entreprenörs, skapa inget objekt. Org.nr i env-variabel, inte hårdkodat.
export function forvantadExecutorOrgnr(): string {
  return process.env.TRAKT_EXECUTOR_ORGNR || '556990-3940';
}

export function executorGodkand(executor: string | undefined | null): boolean {
  const bara = (s: string) => s.replace(/\D/g, ''); // jämför siffror: "556990-3940" == "5569903940"
  return !!executor && bara(executor) === bara(forvantadExecutorOrgnr());
}
