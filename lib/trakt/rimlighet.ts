// Rimlighetskontroll av en trakts volym mot dess areal: m³fub per hektar.
//
// Varför: Bågskyttebanan kom från Vida med 3 495 m³fub på 5,68 ha = 615 m³fub/ha (stämplingslängden säger 1 884 m³sk ≈ 1 560 m³fub = 274/ha).
// Arealen var rätt (geometrin: en enda traktdel, 5,69 ha) och importen läste rätt fält — talet var fel i Vidas objektfil. Det var det enda av
// 66 objekt utanför rimligt intervall, men volymerna SUMMERAS rakt in i beställningen, så ett enda fel räcker för att "Beställningen fylld ·
// 1 234 över" ska stå där det i själva verket saknas 701 m³fub.
//
// Kontrollen FLAGGAR bara — den rättar aldrig talet. För en avslutad trakt är det inmätta talet från VO:n det enda som betyder något, och
// det kan bara en människa få från Vida.
//
// Intervallen är observerade m³fub/ha i prod 2026-10-20 (utan Bågskyttebanan), med marginal utanför:
//   gallring        n=13   19 – 30 (median) – 63   → larmar under 15 och över 80
//   slutavverkning  n=26   96 – 256 (median) – 417 → larmar under 90 och över 450
// Medianen 256/ha bekräftar också att de lagrade volymerna är m³fub, inte m³sk. Samma två funktioner körs vid importen (en rad i
// import_varningar) och i vyn (härlett vid läsning, så en rättad volym släcker frågan av sig själv).

export const ORIMLIG_VOLYM_NYCKEL = 'orimlig_volym';

/** m³fub per hektar som anses rimligt, per typ. Under `min` eller över `max` → fråga. */
export const RIMLIG_M3FUB_PER_HA = {
  slutavverkning: { min: 90, max: 450 },
  gallring: { min: 15, max: 80 },
} as const;

type BedomdTyp = keyof typeof RIMLIG_M3FUB_PER_HA;
const arBedomdTyp = (t: unknown): t is BedomdTyp => t === 'slutavverkning' || t === 'gallring';

const sv = (n: number, d = 0) => n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** m³fub per hektar, eller null när volym eller areal saknas / inte är ett positivt tal. */
export function volymPerHa(volym: unknown, areal: unknown): number | null {
  const v = Number(volym), a = Number(areal);
  if (!Number.isFinite(v) || !Number.isFinite(a) || v <= 0 || a <= 0) return null;
  return v / a;
}

/**
 * Frågetexten när volymen är orimlig för arealen, annars null (rimlig, eller inte bedömbar: annan typ, saknad volym eller areal).
 * Båda talen står i texten så att den går att bedöma utan att öppna något.
 */
export function orimligVolymText(typ: unknown, volym: unknown, areal: unknown): string | null {
  if (!arBedomdTyp(typ)) return null;
  const perHa = volymPerHa(volym, areal);
  if (perHa == null) return null;
  const { min, max } = RIMLIG_M3FUB_PER_HA[typ];
  if (perHa >= min && perHa <= max) return null;
  return `${sv(Number(volym))} m³fub på ${sv(Number(areal), 2)} ha är ${sv(perHa)} per hektar. Kontrollera mot stämplingslängden.`;
}

/** Känner igen texten ovan (importen skriver den som en rad; klassningen i lib/trakt/varningar gör den till en fråga med nyckeln orimlig_volym). */
export const ORIMLIG_VOLYM_RAD = /^[\d\s ]+ m³fub på [\d\s ]+(?:,\d+)? ha är [\d\s ]+ per hektar\. Kontrollera mot stämplingslängden\.$/;
