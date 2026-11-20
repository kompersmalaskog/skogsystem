// KONTROLLEN av en inläst stämplingsrapport — vanlig kod, ingen AI.
//
// AI:n har läst rader och rapportens egna summor (rapport.ts). Här summeras raderna och jämförs mot de tryckta
// summorna, per trädslag, på BÅDE antal och volym m3sk. Ett läsfel kan ta ut sig självt på antalet (en 3:a läst som
// 8 på en rad och en 8:a läst som 3 på en annan), men knappast samtidigt på volymen. Stämmer allt får modellen
// räkna direkt. Avviker något blir det ÅTGÄRD BEHÖVS med trädslag och differens, användaren rättar enskilda
// rader, och ingenting räknas vidare förrän det stämmer. Hellre ingen siffra än en felaktig.
//
// TOLERANS PÅ VOLYMEN. Både raderna och den tryckta summan är avrundade. Summan av radernas avrundade volymer kan
// därför avvika från den tryckta summan med högst en halv enhet i sista decimalen per rad plus en halv i den tryckta
// summans. Jeppshoka gran: 3 256,57 mot 3 256,56 (25 rader med två decimaler → tolerans 0,13); Bågskyttebanan tall:
// 1 433,3 mot 1 433 (22 rader med en decimal → 1,6). ANTALET har ingen tolerans: heltal ska stämma exakt.
//
// "Stämmer" bevisar att SUMMORNA stämmer, inte att varje rad står i rätt klass. Därför flaggas rader där volymen per
// träd bryter mot ordningen mellan grannklasserna (ett träd i en grövre klass väger mer) som MISSTÄNKTA — ett
// stöd för den som rättar, inget som blockerar.

import type { Lasning, Tradslag, KlassRad } from './rapport';

export type SlagTyp = 'tall' | 'gran' | 'ovrigt_barr' | 'torr' | 'lov' | 'okand';
/** De som modellen räknar på (stamplings_klass har tall, gran; övrigt barr räknas som gran). */
export const MODELLSLAG: SlagTyp[] = ['tall', 'gran', 'ovrigt_barr'];

/** Trädslagets namn som det står tryckt → typ. Okänt namn blockerar (se kontrollera), det gissas aldrig. */
export function slagTyp(namn: string): SlagTyp {
  const n = namn.toLowerCase().normalize('NFC').trim();
  if (/torr/.test(n)) return 'torr';                                        // "Torra", "Torrträd", "Torr tall"
  if (/^(övrigt|ovrigt|annat|övr\.?)\s*barr|contorta|lärk|larch|douglas|ädelgran|tuja/.test(n)) return 'ovrigt_barr';
  if (/^tall\b|^tallar\b|^pine/.test(n)) return 'tall';
  if (/^gran\b|^granar\b|^spruce/.test(n)) return 'gran';
  if (/löv|lov\b|björk|bok\b|ek\b|asp\b|al\b|lönn|ask\b|rönn|sälg|hägg|avenbok|lind\b/.test(n)) return 'lov';
  return 'okand';
}

export const SLAGTYP_NAMN: Record<SlagTyp, string> = {
  tall: 'Tall', gran: 'Gran', ovrigt_barr: 'Övrigt barr', torr: 'Torra träd', lov: 'Löv', okand: 'Okänt trädslag',
};

const decimaler = (x: number): number => {
  const s = String(x);
  if (/e-/i.test(s)) return 6;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

/** Tillåten skillnad mellan summan av radernas volymer och den tryckta summan. */
export function volymTolerans(rader: KlassRad[], tryckt: number): number {
  const medVolym = rader.filter(r => r.volym_m3sk != null);
  const dRad = Math.max(0, ...medVolym.map(r => decimaler(r.volym_m3sk as number)));
  const halvRad = 0.5 * Math.pow(10, -dRad), halvSumma = 0.5 * Math.pow(10, -decimaler(tryckt));
  return halvSumma + medVolym.length * halvRad + 1e-9;
}

export type TradslagKontroll = {
  index: number;                 // plats i lasning.tradslag
  namn: string;
  typ: SlagTyp;
  iModellen: boolean;
  rader: number;
  summaAntal: number;
  summaVolym: number | null;     // null = inga rader har volym
  tryktAntal: number | null;
  tryktVolym: number | null;
  tryktKalla: 'tabell' | 'sammanfattning' | null;
  diffAntal: number | null;      // summa − tryckt
  diffVolym: number | null;
  tolVolym: number | null;
  antalOk: boolean | null;       // null = rapporten har ingen egen summa att jämföra mot
  volymOk: boolean | null;       // null = antingen raderna eller summan saknar volym
  ok: boolean;
  misstankta: number[];          // diametrar där volym per träd bryter mot grannklasserna
};
export type Atgard = { tradslag: string; text: string };
export type Kontroll = {
  tradslag: TradslagKontroll[];
  total: { tryckt: number; summaTryckta: number; diff: number; tol: number; ok: boolean } | null;
  klart: boolean;                // true = modellen får räkna
  atgard: Atgard[];              // varför inte, i klartext
  ejIModellen: string[];         // "Torra: 1 träd, ingår inte"
  varningar: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-zåäö]/g, '');
const fmt = (n: number, d = 0) => n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
const tecken = (n: number, d = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n), d)}`;

/** Rader där volym per träd bryter mot ordningen: grövre klass ska inte väga mindre per träd än den närmast tunnare. */
export function misstankta(klasser: KlassRad[]): number[] {
  const r = klasser.filter(k => k.volym_m3sk != null && k.antal > 0).sort((a, b) => a.diameter_cm - b.diameter_cm);
  const ut: number[] = [];
  for (let i = 1; i < r.length; i++) {
    const v = (r[i].volym_m3sk as number) / r[i].antal, fore = (r[i - 1].volym_m3sk as number) / r[i - 1].antal;
    // Avrundning: ett träds volym i en klass med få träd är grov (0,1 m3sk på ett träd = ±50 %).
    const slack = 0.06 / Math.min(r[i].antal, r[i - 1].antal) + 0.05 * fore;
    if (v < fore - slack) ut.push(r[i].diameter_cm);
  }
  return ut;
}

export function kontrollera(l: Lasning): Kontroll {
  const atgard: Atgard[] = [];
  const varningar: string[] = [];
  const ejIModellen: string[] = [];

  const tradslag: TradslagKontroll[] = l.tradslag.map((t, index) => {
    const typ = slagTyp(t.namn);
    const iModellen = MODELLSLAG.includes(typ);
    const rader = t.klasser.filter(k => k.antal > 0);
    const summaAntal = rader.reduce((s, k) => s + k.antal, 0);
    const harVolym = rader.some(k => k.volym_m3sk != null);
    const summaVolym = harVolym ? rader.reduce((s, k) => s + (k.volym_m3sk ?? 0), 0) : null;

    // Rapportens egen summa: tabellens, annars sammanfattningens (samma trädslag).
    const samm = l.sammanfattning.find(s => norm(s.namn) === norm(t.namn) || (slagTyp(s.namn) === typ && typ !== 'okand' && typ !== 'lov'));
    const tryktAntal = t.tryckt_antal ?? samm?.antal ?? null;
    const tryktVolym = t.tryckt_volym_m3sk ?? samm?.volym_m3sk ?? null;
    const tryktKalla = t.tryckt_antal != null || t.tryckt_volym_m3sk != null ? 'tabell' : (samm ? 'sammanfattning' : null);

    const diffAntal = tryktAntal == null ? null : summaAntal - tryktAntal;
    const antalOk = tryktAntal == null ? null : diffAntal === 0;
    const tolVolym = tryktVolym == null || !harVolym ? null : volymTolerans(rader, tryktVolym);
    const diffVolym = summaVolym == null || tryktVolym == null ? null : summaVolym - tryktVolym;
    const volymOk = diffVolym == null || tolVolym == null ? null : Math.abs(diffVolym) <= tolVolym;
    const mist = misstankta(rader);

    // ok = går att räkna på: antalet ska finnas att jämföra mot och stämma; volymen får bara vara ok eller omätbar
    // när rapporten själv saknar volym (aldrig när rapporten har en volymsumma som raderna inte kan jämföras med).
    const volymOmojlig = tryktVolym != null && !harVolym;
    const ok = antalOk === true && volymOk !== false && !volymOmojlig;

    if (iModellen || typ === 'okand') {
      if (rader.length === 0) atgard.push({ tradslag: t.namn, text: `${t.namn}: inga diameterklasser lästes.` });
      else if (antalOk === null) atgard.push({ tradslag: t.namn, text: `${t.namn}: rapportens egen summa för antal träd saknas — antalet kan inte kontrolleras.` });
      else if (antalOk === false) atgard.push({ tradslag: t.namn, text: `${t.namn}: ${fmt(summaAntal)} mot ${fmt(tryktAntal as number)} träd (${tecken(diffAntal as number)}).` });
      if (volymOk === false) atgard.push({ tradslag: t.namn, text: `${t.namn}: ${fmt(summaVolym as number, 1)} mot ${fmt(tryktVolym as number, 1)} m³sk (${tecken(diffVolym as number, 1)}, tillåtet ±${fmt(tolVolym as number, 1)}).` });
      if (volymOmojlig) atgard.push({ tradslag: t.namn, text: `${t.namn}: rapporten anger volym (${fmt(tryktVolym as number, 1)} m³sk) men raderna saknar volym per klass — volymen kan inte kontrolleras.` });
      if (typ === 'okand') atgard.push({ tradslag: t.namn, text: `"${t.namn}" känns inte igen som tall, gran eller övrigt barr. Rätta namnet — eller ta bort trädslaget om det inte ska räknas.` });
    } else {
      if (rader.length) ejIModellen.push(`${t.namn}: ${fmt(summaAntal)} ${summaAntal === 1 ? 'träd' : 'träd'}${summaVolym != null ? `, ${fmt(summaVolym, 1)} m³sk` : ''} — ingår inte i beräkningen`);
      if (antalOk === false || volymOk === false) varningar.push(`${t.namn} (räknas inte): raderna stämmer inte mot rapportens summa — påverkar inte beräkningen.`);
    }
    return {
      index, namn: t.namn, typ, iModellen, rader: rader.length, summaAntal, summaVolym, tryktAntal, tryktVolym, tryktKalla,
      diffAntal, diffVolym, tolVolym, antalOk, volymOk, ok: iModellen ? ok : true, misstankta: mist,
    };
  });

  // Hela postens volym: summan av trädslagens tryckta volymer mot rapportens totaltal. Varning, inte spärr.
  let total: Kontroll['total'] = null;
  if (l.post.total_volym_m3sk != null) {
    const delar = tradslag.map(t => t.tryktVolym).filter((x): x is number => x != null);
    if (delar.length === tradslag.length && delar.length) {
      const summaTryckta = delar.reduce((s, x) => s + x, 0);
      const tol = 0.5 + 0.5 * delar.length;
      const diff = summaTryckta - l.post.total_volym_m3sk;
      total = { tryckt: l.post.total_volym_m3sk, summaTryckta, diff, tol, ok: Math.abs(diff) <= tol };
      if (!total.ok) varningar.push(`Trädslagens tryckta volymer summerar till ${fmt(summaTryckta, 1)} m³sk men postens totala volym är ${fmt(l.post.total_volym_m3sk, 1)} — kontrollera att inget trädslag saknas.`);
    }
  }
  for (const o of l.osakerheter) varningar.push(`AI:n var osäker: ${o}`);

  const modell = tradslag.filter(t => t.iModellen);
  if (!modell.some(t => t.rader > 0)) atgard.push({ tradslag: '', text: 'Ingen tall, gran eller övrigt barr med diameterklasser hittades — det finns inget att räkna på.' });
  const klart = atgard.length === 0 && tradslag.filter(t => t.typ !== 'okand').every(t => t.ok) && modell.some(t => t.rader > 0);
  return { tradslag, total, klart, atgard, ejIModellen, varningar };
}

/** Rapportens klasser → texten som stämplingsvyn redan förstår ("cm antal" per rad), per trädslag. Samma trädslag på två tabeller summeras. */
export function tillLangdText(l: Lasning): { tall: string; gran: string; ovrigt_barr: string } {
  const per: Record<'tall' | 'gran' | 'ovrigt_barr', Map<number, number>> = { tall: new Map(), gran: new Map(), ovrigt_barr: new Map() };
  for (const t of l.tradslag) {
    const typ = slagTyp(t.namn);
    if (typ !== 'tall' && typ !== 'gran' && typ !== 'ovrigt_barr') continue;
    for (const k of t.klasser) if (k.antal > 0) per[typ].set(k.diameter_cm, (per[typ].get(k.diameter_cm) ?? 0) + k.antal);
  }
  const text = (m: Map<number, number>) => Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([cm, n]) => `${cm} ${n}`).join('\n');
  return { tall: text(per.tall), gran: text(per.gran), ovrigt_barr: text(per.ovrigt_barr) };
}

/** En enda läsbar rad om var och en av summorna — det som visas när allt stämmer. */
export function stammerRader(k: Kontroll): string[] {
  return k.tradslag.filter(t => t.iModellen && t.rader > 0).map(t =>
    `${t.namn}: ${fmt(t.summaAntal)} träd${t.summaVolym != null ? `, ${fmt(t.summaVolym, 1)} m³sk` : ''} — stämmer mot rapportens ${fmt(t.tryktAntal as number)}${t.tryktVolym != null ? ` och ${fmt(t.tryktVolym, 1)}` : ''}`);
}

export type { Lasning, Tradslag, KlassRad };
