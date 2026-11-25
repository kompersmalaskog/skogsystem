// Mutationskontroll för "en sanning för traktgränsen" (Martin 2026-11-25): justerade kopior skickas som lng/lat till servern och byter ut Vidas delar i vyn objekt_traktgrans.
// Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs. SQL-delen (vyn, RPC:n) har egen kontroll i supabase/tests/traktgrans_justerad_lokal.
//
// Kör:  node scripts/mutationskontroll-justerad-grans.mjs   (EN tung körning åt gången)
import { kor } from "./mutationsmotor.mjs";

const MODELL = "lib/justeradGrans.ts";
const SYNK = "lib/justeradGransSynk.ts";
const SIDA = "app/planering/page.tsx";

const TESTER = ["lib/justeradGrans.test.ts", "lib/justeradGrans.vakter.test.ts"];

const M = [
  // ── modellen ──
  ["origot kontrolleras inte (hörn långt från Vida skrivs ändå)", "if (ll.lon < minLng - mLng || ll.lon > maxLng + mLng || ll.lat < minLat - mLat || ll.lat > maxLat + mLat) {", "if (false) {", MODELL],
  ["marginalen är för snäv (vanliga justeringar vägras)", "export const JUSTERAD_MARGINAL_M = 300;", "export const JUSTERAD_MARGINAL_M = 1;", MODELL],
  ["dubblett-slutpunkten tas inte bort", "if (ring.length >= 2) { const a = ring[0], z = ring[ring.length - 1]; if (a[0] === z[0] && a[1] === z[1]) ring.pop(); }", "", MODELL],
  ["den äldsta markören vinner när två hör till samma del", "if (!had || ts > had.ts || (ts === had.ts && id > had.id)) perDel.set(nyckel, { m, ts, id });", "if (!had) perDel.set(nyckel, { m, ts, id });", MODELL],
  ["egna områden (utan fromVidaTd) räknas som justerade delar", "m.fromVidaTd != null && String(m.fromVidaTd) !== '')) continue;", "true)) continue;", MODELL],
  ["koordinaterna avrundas inte (signaturen darrar)", "const avrunda = (v: number): number => Math.round(v * 1e7) / 1e7;", "const avrunda = (v: number): number => v;", MODELL],
  ["delarna sorteras inte (signaturen beror på markörernas ordning)", "[...perDel.entries()].sort((a, b) => a[0].localeCompare(b[0]))", "[...perDel.entries()]", MODELL],
  ["Vidas delar behövs inte (ok utan att veta var Vida ligger)", "if (!Number.isFinite(minLng)) return { ok: false, skal: 'Vidas traktdelar är inte lästa' };", "", MODELL],
  ["ett ogiltigt tal släpps igenom", "if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) return { ok: false, skal: `ogiltigt hörn i ${partKey}` };", "", MODELL],
  ["en del med två hörn skickas", "    if (ring.length < 3) continue;\n    delar.push", "    delar.push", MODELL],
  ["tom signatur ≠ tom text", "return delar.length ? JSON.stringify(delar) : '';", "return JSON.stringify(delar);", MODELL],

  // ── synken ──
  ["en oförändrad gräns skickas om vid varje öppning", "if (sparad === sig) return 'oforandrad';", "", SYNK],
  ["en tom lista skickas även när inget någonsin skickats", "if (sparad == null && sig === '') return 'oforandrad';", "", SYNK],
  ["minnet skrivs inte efter lyckad sändning", "  skrivMinne(objektId, sig);\n  return 'skickad';", "  return 'skickad';", SYNK],
  ["minnet skrivs trots fel (nästa försök uteblir)", "if (error) { console.warn('Justerad traktgräns kunde inte sparas på servern:', error.message ?? error); return 'fel'; }", "if (error) { console.warn('x'); skrivMinne(objektId, sig); return 'fel'; }", SYNK],
  ["radering skickas inte som tom lista", "{ p_objekt: objektId, p_delar: delar }", "{ p_objekt: objektId, p_delar: delar.length ? delar : undefined }", SYNK],
  ["omräkningen anropar bara traktanalysen", "['/api/cron/traktanalys', '/api/cron/skogsdata']", "['/api/cron/traktanalys']", SYNK],

  // ── sidans koppling ──
  ["skickas även av vanliga förare", "if (!oid || !isAdminRiktig || testlage || maskinlage) return;", "if (!oid) return;", SIDA],
  ["skickas medan hörn redigeras (gamla markörer)", "if (hornEditActive || redigeraGransIdn.length > 0) return;\n    const bygg = byggJusteradeDelar", "const bygg = byggJusteradeDelar", SIDA],
  ["skickas innan markörerna hör till objektet", "if (!markersLoaded || markersObjektIdRef.current !== oid || traktGeoHamtadFor !== oid || traktdelDelar.length === 0) return;", "if (!oid) return;", SIDA],
  ["fel origo skriver ändå", "if (!bygg.ok) { console.warn('Justerad traktgräns skickas inte:', bygg.skal); return; }", "if (!bygg.ok) { console.warn('Justerad traktgräns skickas inte:', bygg.skal); }", SIDA],
  ["räknar inte om analyserna efter en ändring", "if (svar === 'skickad') raknaOmEfterGransandring();", "", SIDA],
];

kor({
  filer: [MODELL, SYNK, SIDA],
  tester: TESTER,
  standardFil: MODELL,
  mutationer: M,
});
