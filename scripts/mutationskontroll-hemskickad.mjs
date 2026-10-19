// Mutationskontroll för Hemskickad (Martin 2026-10-17): dagen fylls upp till 8 tim och betalas som timlön, räknas mot ordinarie, aldrig övertid,
// ingen frånvaro. Varje del ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-hemskickad.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       Välj efter namn:  MUT_NAMN='övertid|frånvaro'      Dela upp:  MUT_FRAN=0 MUT_TILL=12
import { kor } from "./mutationsmotor.mjs";

const FRV = "lib/franvaro.ts";
const LB = "lib/lonesystem/loneberakning.ts";
const AO = "lib/lonesystem/arsovertid.ts";
const FT = "lib/lonesystem/forarText.ts";
const LV = "lib/admin/loneunderlagVy.ts";
const DAG = "components/admin/DagarUnderflik.tsx";
const ARB = "components/arbetsrapport/Arbetsrapport.tsx";

const kommando = ["bash", "-c", [
  "npx vitest run lib/lonesystem/loneberakning.hemskickad.test.ts lib/lonesystem/arsovertid.hemskickad.test.ts lib/lonesystem/forarText.test.ts lib/admin/loneunderlagVy.test.ts --reporter=dot",
  "npx vitest run components/admin/Admin.render.test.tsx -t 'Hemskickad i Admin' --reporter=dot",
  "npx vitest run components/arbetsrapport/Arbetsrapport.hemskickad.render.test.tsx --reporter=dot",
].join(" && ")];

const M = [
  // ── Fyllnaden: 8 tim minus arbetad tid ──
  ["dagen fylls upp till 7 tim i stället för 8", "export const HEM_DAG_MIN = 480;", "export const HEM_DAG_MIN = 420;", FRV],
  ["fyllnaden kan bli negativ (en dag med över 8 tim arbete)", "return Math.max(0, HEM_DAG_MIN - m);", "return HEM_DAG_MIN - m;", FRV],

  // ── Lönemotorn ──
  ["den hemskickade tiden betalas inte (ligger inte i totalen)", "totalH += hemArbetsdagMin / 60 + hemOvrigH;", "totalH += hemOvrigH;", LB],
  ["den hemskickade dagen utan ×8 ger övertid", "totalH - ordinarie - kortpassH - hemOvrigH) * 100) / 100;", "totalH - ordinarie - kortpassH) * 100) / 100;", LB],
  ["den hemskickade tiden på en dag utan ×8 kapas ur timlönen", "Math.min(totalH, ordinarie + kortpassH + hemOvrigH) * 100) / 100;", "Math.min(totalH, ordinarie + kortpassH) * 100) / 100;", LB],
  ["hemskickad blir en deldag (frånvaro) i granskningen", "if (String(l.typ || '').toLowerCase() === 'hemskickad') continue;   // betald tid, ingen frånvaro: egen lista ovan (`hemskickad`)\n", "", LB],
  ["en hemskickad rad utan klockslag blir en frånvarorad", "if (String(l.typ || '').toLowerCase() === 'hemskickad') continue; // betald tid (egen lista `hemskickad`), aldrig frånvaro — även om en rad skulle sakna klockslag\n", "", LB],
  ["samma dag två gånger betalas två gånger", "if (!l.startdatum.startsWith(arbperiod) || hemSedda.has(l.startdatum)) continue;", "if (!l.startdatum.startsWith(arbperiod)) continue;", LB],
  ["en hemskickad dag i en annan månad betalas", "if (!l.startdatum.startsWith(arbperiod) || hemSedda.has(l.startdatum)) continue;", "if (hemSedda.has(l.startdatum)) continue;", LB],
  ["extra tid räknas inte som arbetad tid vid påfyllningen", "const arbetadMin = (arbMinPerDatum.get(l.startdatum) || 0) + (extraMinPerDatum.get(l.startdatum) || 0);", "const arbetadMin = (arbMinPerDatum.get(l.startdatum) || 0);", LB],
  ["hemskickad på en dag utan ×8 räknas som en arbetsdag", "if (arbetsdagDatum.has(l.startdatum)) hemArbetsdagMin += minuter; else hemOvrigMin += minuter;", "hemArbetsdagMin += minuter;", LB],
  ["timlönens beskrivning säger inget om hemskickad", "${hemskickadH > 0 ? ` varav ${hemskickadH}h hemskickad` : ''}", "", LB],

  // ── Årsövertiden ──
  ["hemskickad drar ur basen som en frånvarodag", "r.typ !== \"inarbetad\" && r.typ !== \"hemskickad\");", "r.typ !== \"inarbetad\");", AO],
  ["den hemskickade tiden räknas inte som arbetad", "hemPerDatum.forEach((hemMin, datum) => { if (hemMin > 0) minPerDatum.set(", "hemPerDatum.forEach((hemMin, datum) => { if (hemMin > 99999) minPerDatum.set(", AO],
  ["hemskickad på en dag under 60 min räknas inte som kortpass-tid", "else m.kortpassMin += (maskinPerDatum.get(datum) || 0) + (hemPerDatum.get(datum) || 0);", "else m.kortpassMin += (maskinPerDatum.get(datum) || 0);", AO],

  // ── Förarens ord ──
  ["dagen säger 'sedan hemskickad' i stället för vad som betalas", "if (ctx.deldag?.typ === \"hemskickad\") { const t = hemskickadText(totalMin); if (t) ut.push(t); }   // betald tid, ingen frånvaro\n  else if (ctx.deldag)", "if (ctx.deldag)", FT],
  ["en full dag får ändå en rad om hemskickad", "return min > 0 ? `hemskickad ${fmtTimMin(min)} – betalas` : null;", "return `hemskickad ${fmtTimMin(min)} – betalas`;", FT],
  ["Min månad har ingen post för hemskickad", "for (const h of (spec?.hemskickad || []) as { datum: string; minuter: number }[]) {", "for (const h of (spec?.hemskickadx || []) as { datum: string; minuter: number }[]) {", FT],

  // ── Admin ──
  ["Admin ser inga hemskickade timmar per förare", "if (hem.length > 0) {\n    const h = Number(m.hemskickad_h || 0)", "if (hem.length > 99) {\n    const h = Number(m.hemskickad_h || 0)", LV],
  ["Dagar visar hemskickad som sjukdeldag", "typ: \"hemskickad\", fran_tid: h.fran_tid, till_tid: null }))", "typ: \"sjuk\", fran_tid: h.fran_tid, till_tid: null }))", DAG],

  // ── Förarens vyer ──
  ["Åker hem-kortet saknar valet", "{(delDag ? DELDAG_VAL : FRANVARO_VAL).map(s=>(", "{FRANVARO_VAL.map(s=>(", ARB],
  ["Redigeras Åkte hem-sheet saknar valet", "{DELDAG_VAL.map(v => (\n              <button key={v.id} onClick={()=>setDeldagSheet(", "{FRANVARO_VAL.map(v => (\n              <button key={v.id} onClick={()=>setDeldagSheet(", ARB],
  ["dagens hemskickad-text läser fel fält (arbetad_min i stället för arbMin)", "const maskinMin = Number(dagRad?.arbMin ?? dagRad?.arbetad_min ?? 0) || 0;", "const maskinMin = Number(dagRad?.arbetad_min ?? 0) || 0;", ARB],
  ["extra tid räknas inte i förarens hemskickad-text", "const min = hemskickadMinuter(maskinMin + extra);", "const min = hemskickadMinuter(maskinMin);", ARB],
  ["hemskickad kan inte anmälas", "export const FRANVARO_ANMALS: readonly FranvaroTyp[] = [\"sjuk\", \"vab\", \"foraldraledig\", \"hemskickad\"];", "export const FRANVARO_ANMALS: readonly FranvaroTyp[] = [\"sjuk\", \"vab\", \"foraldraledig\"];", FRV],
  ["hemskickad kan skrivas som hel dag", "if (p.typ === \"hemskickad\" && (!p.franTid || p.tillTid))", "if (false)", FRV],
];

kor({
  filer: [FRV, LB, AO, FT, LV, DAG, ARB],
  tester: [],
  standardFil: LB,
  kommando,
  mutationer: M.slice(Number(process.env.MUT_FRAN ?? 0), Number(process.env.MUT_TILL ?? M.length)).filter(m => !process.env.MUT_NAMN || new RegExp(process.env.MUT_NAMN, "i").test(m[0])),
});
