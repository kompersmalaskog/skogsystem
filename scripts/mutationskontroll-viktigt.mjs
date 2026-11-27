// Mutationskontroll för "Viktigt"-raden i kommentaren (Martin 2026-11-23): en rad, högst 60 tecken, orange och överst på kortet, orange pratbubbla på kartan (ingen text, 2026-11-26) och överst i Hela trakten.
// Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-viktigt.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const MODELL = "lib/kartkommentar.ts";
const KO = "lib/kartkommentarKo.ts";
const HOOK = "lib/hooks/useKartkommentarer.ts";
const RUTA = "components/planering/KommentarRuta.tsx";
const KORT = "components/planering/KartKort.tsx";
const OVERSIKT = "components/planering/TraktOversikt.tsx";
const INSTR = "lib/instruktioner/instruktioner.ts";
const TECKEN = "lib/kommentarTecken.ts";
const SIDA = "app/planering/page.tsx";

const TESTER = [
  "lib/kartkommentar.viktigt.test.ts",
  "lib/hooks/useKartkommentarer.viktigt.test.tsx",
  "lib/instruktioner/viktigt.test.ts",
  "lib/kommentarTecken.test.ts",
  "components/planering/KartKort.viktigt.render.test.tsx",
  "components/planering/InstruktionKort.render.test.tsx",
  "components/planering/TraktOversikt.render.test.tsx",
];

const M = [
  // ── modellen ──
  ["Viktigt får vara 61 tecken", "export const VIKTIGT_MAX = 60;", "export const VIKTIGT_MAX = 61;", MODELL],
  ["en kommentar med bara Viktigt räknas som tom", "!!String(text ?? '').trim() || !!rensaViktigt(viktigt)", "!!String(text ?? '').trim()", MODELL],
  ["Viktigt ligger inte överst i kortets lista", "return [...rader.filter((r) => r.viktigt), ...rader.filter((r) => !r.viktigt)];", "return rader;", MODELL],
  ["en ändring av en väntande ny kommentar tappar Viktigt", "viktigt: ny.viktigt !== undefined ? ny.viktigt : befintlig.viktigt,", "viktigt: ny.viktigt,", MODELL],
  ["en ny post i kön visas utan Viktigt", "text: p.text, viktigt: p.viktigt ?? null, skapad_av", "text: p.text, skapad_av", MODELL],
  ["larmraden visar Övrigt före Viktigt", "const t = rensaViktigt(r.viktigt) ?? r.text;", "const t = r.text || rensaViktigt(r.viktigt) || '';", MODELL],
  ["kolumn som saknas känns inte igen", "return (c === 'PGRST204' || c === '42703') && /viktigt/i.test(m);", "return false;", MODELL],
  ["signaturen ignorerar Viktigt", "export const kommentarSigText = (r: { text: string; viktigt?: string | null }): string => (rensaViktigt(r.viktigt) ? `${rensaViktigt(r.viktigt)}\\n${r.text}` : r.text);", "export const kommentarSigText = (r: { text: string; viktigt?: string | null }): string => r.text;", MODELL],
  ["Viktigt-nycklar läggs inte ihop äldst först", "for (const r of sorteraKommentarer(rader)) {", "for (const r of rader) {", MODELL],

  // ── kön och hooken ──
  ["en Viktigt-post ges upp när kolumnen saknas", "if (p.viktigt != null && arViktigtKolumnSaknas(fel)) return 'igen';", "", KO],
  ["Viktigt skickas aldrig vid ny", "...(p.viktigt != null ? { viktigt: p.viktigt } : {}) });", "});", KO],
  ["en vanlig ändring skickar alltid Viktigt", "const viktigtDel = p.viktigt === undefined ? {} : { viktigt: p.viktigt };", "const viktigtDel = { viktigt: p.viktigt ?? null };", KO],
  ["läsningen faller inte tillbaka utan kolumnen", "if (error && arViktigtKolumnSaknas(error)) {", "if (false) {", HOOK],
  ["Viktigt-fältet visas även när kolumnen saknas", "setViktigtStod(stod);", "setViktigtStod(true);", HOOK],
  ["en ändring skickar Viktigt även när den inte ändrats", "const ändrasViktigt = viktigt !== undefined && (v ?? null) !== (rad.viktigt ?? null);", "const ändrasViktigt = viktigt !== undefined;", HOOK],

  // ── kortet ──
  ["Viktigt-raden är inte orange", "color: FARG.orange, overflowWrap", "color: FARG.text, overflowWrap", RUTA],
  ["Viktigt-raden är inte fet", "fontWeight: VIKT.fet }}>{text}</span>", "fontWeight: VIKT.normal }}>{text}</span>", RUTA],
  ["Viktigt-raden saknar ⚠", ">warning</span>", ">info</span>", RUTA],
  ["Viktigt står under Övrigt i rutan", "{viktigt ? <div style={{ marginBottom: text.trim() ? AVSTAND.m : 0 }}><ViktigtRad text={viktigt} /></div> : null}\n      {medStreck", "{medStreck", RUTA],
  ["Viktigt-rutorna står efter Vidas text", "{viktiga.map((r) => <KommentarRadVy key={r.id} r={r} onAndra={onAndra} onRadera={onRadera} kanViktigt={kanViktigt} />)}\n      {kommentarPunkter(vida)", "{kommentarPunkter(vida)", KORT],
  ["Viktigt-fältet har ingen gräns på 60", "maxLength={VIKTIGT_MAX}", "", KORT],
  ["Spara kräver Övrigt även när Viktigt finns", "const kan = !!text.trim() || (kanViktigt && !!viktigt.trim());", "const kan = !!text.trim();", KORT],
  ["Viktigt-fältet visas även utan stöd i databasen", "{kanViktigt && (\n        <label style={{ display: 'block', marginBottom: AVSTAND.m }}>", "{(\n        <label style={{ display: 'block', marginBottom: AVSTAND.m }}>", KORT],

  // ── Hela trakten ──
  ["Viktigt-sektionen finns inte", "{(viktigaMark.length > 0 || viktigaHela.length > 0) && (", "{(false) && (", OVERSIKT],
  ["en sak med Viktigt står också bland sorterna", "byggOmGrupper(p.markeringar.filter((m) => !viktigaIdn.has(m.id)), null,", "byggOmGrupper(p.markeringar, null,", OVERSIKT],
  ["en fara räknas som Viktigt (dubbel rad)", "harViktigtMark(m) && !faroIdn.has(m.id)", "harViktigtMark(m)", OVERSIKT],
  ["Viktigt på trakten står också bland det övriga", "const overigaHela = useMemo(() => p.helaTrakten.filter((k) => !k.viktigt), [p.helaTrakten]);", "const overigaHela = p.helaTrakten;", OVERSIKT],

  // ── instruktionerna ──
  ["en kommentar med bara Viktigt är ingen instruktion", ".filter((r) => r.text.trim() || rensaViktigt(r.viktigt))", ".filter((r) => r.text.trim())", INSTR],
  ["en ändrad Viktigt är inte osedd", "hash: hashText(rensaViktigt(r.viktigt) ? `${rensaViktigt(r.viktigt)}\\n${r.text}` : r.text),", "hash: hashText(r.text),", INSTR],
  ["Viktigt kommer inte först i instruktionerna", "function ordning(i: Instruktion): number { return i.viktigt ? -1 :", "function ordning(i: Instruktion): number { return", INSTR],
  ["pillen säger tom text för Viktigt", "text: o.instruktioner[0].viktigt || forstaPunkt(o.instruktioner[0].text), instruktioner", "text: forstaPunkt(o.instruktioner[0].text), instruktioner", INSTR],

  // ── kartan: orange pratbubbla, ingen text ──
  ["Viktigt ger ingen orange bubbla", "if (harViktigt) return harFoto ? 'viktigtfoto' : 'viktigt';", "", TECKEN],
  ["Viktigt-bubblan är vit", "(arViktigt(slag) ? FARG.orange : '#ffffff')", "'#ffffff'", TECKEN],
  ["en Vida-yta med Viktigt får en vanlig bubbla", "if (d.length) lagg(inrePunkt(d[0]) as unknown as Pos, slag, true, nyckel);", "if (d.length) lagg(inrePunkt(d[0]) as unknown as Pos, 'text', true, nyckel);", TECKEN],
  ["en symbol med Viktigt tonas ned av avstånd", "KORVY_FARO_TYPER.has(String(m.type)) || viktigtNycklar.has(markerNyckel(m.id))", "KORVY_FARO_TYPER.has(String(m.type))", SIDA],
];

kor({
  filer: [MODELL, KO, HOOK, RUTA, KORT, OVERSIKT, INSTR, TECKEN, SIDA],
  tester: TESTER,
  standardFil: MODELL,
  mutationer: M,
});
