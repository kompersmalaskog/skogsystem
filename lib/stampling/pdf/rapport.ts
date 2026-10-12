// STÄMPLINGSRAPPORT SOM PDF — vad AI:n får läsa och i vilken form den svarar.
//
// Regeln: AI:n LÄSER, den räknar och rättar aldrig. Allt den svarar är det som står tryckt, rad för rad, plus
// rapportens egna summor (det som kontrollen sedan jämför mot). Kontrollen är vanlig kod (kontroll.ts).
//
// Formen är medvetet vid — rapporterna ser olika ut:
//   * Jeppshoka (textlager): en tabell per trädslag med antal, volym m3sk, medelstam, m3fub, höjd; Totalt-rad.
//   * Bågskyttebanan (inskannad): två spalter (Tall, Gran) per sida med antal, höjd, volym m3sk; "Antal träd" och
//     "Volym m3sk" under; torra träd i en egen tabell med ett träd; totalvolymen står i löptexten på första sidan.
// Därför är allt utom trädslagens klasser valfritt (null), och ett trädslag får ha en klasstabell eller bara summor.

export type KlassRad = { diameter_cm: number; antal: number; volym_m3sk: number | null };
export type Tradslag = {
  namn: string;                          // som det står tryckt: "Tall", "Gran", "Övrigt barr", "Torra"
  klasser: KlassRad[];
  tryckt_antal: number | null;           // rapportens egen summa för trädslaget (Totalt / Antal träd)
  tryckt_volym_m3sk: number | null;      // rapportens egen volymsumma för trädslaget
};
export type Post = {
  namn: string | null;                   // postens namn: "Jeppshoka 2025", "Bågskyttebanan"
  fastighet: string | null;
  agare: string | null;
  forrattare: string | null;             // stämplingsförrättare / förrättningsman
  datum: string | null;                  // stämplingsdatum, YYYY-MM-DD
  total_volym_m3sk: number | null;       // rapportens totala volym
};
/** Sammanfattande siffror per trädslag från första sidan / löptexten — används som reserv och som korskontroll. */
export type Sammanfattning = { namn: string; antal: number | null; volym_m3sk: number | null };
export type Lasning = {
  post: Post;
  tradslag: Tradslag[];
  sammanfattning: Sammanfattning[];
  osakerheter: string[];                 // AI:ns egna "den här siffran är svårläst" — visas, räknas inte
};

export const TOM_POST: Post = { namn: null, fastighet: null, agare: null, forrattare: null, datum: null, total_volym_m3sk: null };

// ── Tolkning av AI:ns svar ───────────────────────────────────────────────

/** "1 035" / "1035" / "24,9" / 24.9 → tal. Allt annat → null. */
export function tal(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const datum = (v: unknown): string | null => {
  const t = text(v);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

/**
 * Gör om ett okänt svar till en Lasning. Försiktig: ett svar som inte går att tolka ger ett FEL, aldrig ett
 * tyst tomt resultat, och rader med oläsliga tal tas inte bort utan lämnas kvar så att kontrollen ser dem.
 */
export function parsaLasning(raw: unknown): { lasning: Lasning; varningar: string[] } {
  const varningar: string[] = [];
  if (!raw || typeof raw !== 'object') throw new Error('Läsningen gav inget svar som går att tolka.');
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.tradslag)) throw new Error('Läsningen saknar trädslag.');

  const p = (r.post && typeof r.post === 'object' ? r.post : {}) as Record<string, unknown>;
  const post: Post = {
    namn: text(p.namn), fastighet: text(p.fastighet), agare: text(p.agare), forrattare: text(p.forrattare),
    datum: datum(p.datum), total_volym_m3sk: tal(p.total_volym_m3sk),
  };
  if (p.datum != null && post.datum == null) varningar.push(`Datumet "${String(p.datum)}" är inte på formen ÅÅÅÅ-MM-DD och visas inte.`);

  const tradslag: Tradslag[] = [];
  for (const t of r.tradslag as unknown[]) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const namn = text(o.namn);
    if (!namn) { varningar.push('Ett trädslag utan namn hoppades över.'); continue; }
    const klasser: KlassRad[] = [];
    for (const k of Array.isArray(o.klasser) ? o.klasser : []) {
      if (!k || typeof k !== 'object') continue;
      const kr = k as Record<string, unknown>;
      const d = tal(kr.diameter_cm), a = tal(kr.antal), v = tal(kr.volym_m3sk);
      if (d == null || a == null) { varningar.push(`${namn}: en rad utan läsbar diameter eller antal hoppades över.`); continue; }
      klasser.push({ diameter_cm: d, antal: Math.round(a), volym_m3sk: v });
    }
    tradslag.push({ namn, klasser, tryckt_antal: tal(o.tryckt_antal) == null ? null : Math.round(tal(o.tryckt_antal) as number), tryckt_volym_m3sk: tal(o.tryckt_volym_m3sk) });
  }
  if (!tradslag.length) throw new Error('Läsningen hittade inga trädslag.');

  const sammanfattning: Sammanfattning[] = [];
  for (const s of Array.isArray(r.sammanfattning) ? r.sammanfattning : []) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const namn = text(o.namn);
    if (namn) sammanfattning.push({ namn, antal: tal(o.antal) == null ? null : Math.round(tal(o.antal) as number), volym_m3sk: tal(o.volym_m3sk) });
  }
  const osakerheter = (Array.isArray(r.osakerheter) ? r.osakerheter : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim());
  return { lasning: { post, tradslag, sammanfattning, osakerheter }, varningar };
}

// ── Schemat som AI:ns svar måste följa ───────────────────────────────────
//
// Skickas som STRUKTURERADE UTDATA (output_config.format = json_schema): API:t garanterar att svaret är JSON enligt schemat.
// Tvingat verktygsval (tool_choice tool/any) går INTE: claude-opus-5-5 svarar 400 "tool_choice: type "tool" and "any" are not
// supported for this model" — upptäckt vid första skarpa läsningen 2026-10-04, när en fejkad klient i testerna hade dolt det.
// Kravet för strukturerade utdata: additionalProperties:false på VARJE objekt (stangObjekt nedan), inga min/max/minLength.

/** Sätter additionalProperties:false på varje objekt i ett schema (rekursivt). */
function stangObjekt<T>(s: T): T {
  if (Array.isArray(s)) return s.map(stangObjekt) as unknown as T;
  if (s && typeof s === 'object') {
    const ut: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) ut[k] = stangObjekt(v);
    if (ut.type === 'object') ut.additionalProperties = false;
    return ut as T;
  }
  return s;
}

const NULLBART = (typ: string, beskrivning: string) => ({ type: [typ, 'null'], description: beskrivning });

const SCHEMA_DEF = {
  description: 'Exakt det som står tryckt i stämplingsrapporten. Räkna aldrig, rätta aldrig, gissa aldrig.',
  input_schema: {
    type: 'object',
    properties: {
      post: {
        type: 'object',
        description: 'Uppgifter om själva posten. null om rapporten inte anger dem.',
        properties: {
          namn: NULLBART('string', 'Postens namn som i rapporten, t.ex. "Jeppshoka 2025" eller fastighetens/postens benämning.'),
          fastighet: NULLBART('string', 'Fastighetsbeteckning/benämning.'),
          agare: NULLBART('string', 'Markägare/säljare.'),
          forrattare: NULLBART('string', 'Stämplingsförrättare / förrättningsman / skogsmästare som stämplade.'),
          datum: NULLBART('string', 'Stämplingsdatum, ÅÅÅÅ-MM-DD.'),
          total_volym_m3sk: NULLBART('number', 'Rapportens totala volym i m3sk för hela posten, så som den står tryckt (även i löptext).'),
        },
        required: ['namn', 'fastighet', 'agare', 'forrattare', 'datum', 'total_volym_m3sk'],
      },
      tradslag: {
        type: 'array',
        description: 'EN post per trädslag-tabell i rapporten (Tall, Gran, Övrigt barr, Torra/torrträd, löv …), i den ordning de står.',
        items: {
          type: 'object',
          properties: {
            namn: { type: 'string', description: 'Trädslagets namn exakt som tryckt.' },
            klasser: {
              type: 'array',
              description: 'Varje diameterklass som har ett antal. Klasser utan antal utelämnas. Ta aldrig med summarader här.',
              items: {
                type: 'object',
                properties: {
                  diameter_cm: { type: 'number', description: 'Diameterklassen i cm som tryckt (t.ex. 26).' },
                  antal: { type: 'integer', description: 'Antal träd i klassen som tryckt.' },
                  volym_m3sk: NULLBART('number', 'Klassens volym i m3sk som tryckt. null om tabellen inte anger volym per klass.'),
                },
                required: ['diameter_cm', 'antal', 'volym_m3sk'],
              },
            },
            tryckt_antal: NULLBART('integer', 'Rapportens EGEN summa av antal träd för trädslaget (raden Totalt / Antal träd under tabellen). Räkna inte själv.'),
            tryckt_volym_m3sk: NULLBART('number', 'Rapportens EGEN volymsumma m3sk för trädslaget (Totalt / Volym m3sk under tabellen). Räkna inte själv.'),
          },
          required: ['namn', 'klasser', 'tryckt_antal', 'tryckt_volym_m3sk'],
        },
      },
      sammanfattning: {
        type: 'array',
        description: 'Per trädslag de sammanfattande siffror som står på första sidan eller i löptexten (t.ex. "tall 1433.2 m3sk, gran 449,9 m3sk och 0,8 m3sk torrträd"). Tom lista om det inte finns några.',
        items: {
          type: 'object',
          properties: {
            namn: { type: 'string' },
            antal: NULLBART('integer', 'Antal träd om det anges.'),
            volym_m3sk: NULLBART('number', 'Volym m3sk om den anges.'),
          },
          required: ['namn', 'antal', 'volym_m3sk'],
        },
      },
      osakerheter: {
        type: 'array',
        description: 'Varje siffra du inte kunde läsa med säkerhet: sida, trädslag, diameter och vad du tvekade om. Tom lista om allt var tydligt.',
        items: { type: 'string' },
      },
    },
    required: ['post', 'tradslag', 'sammanfattning', 'osakerheter'],
  },
} as const;

/** Schemat som skickas i output_config.format. */
export const UTDATA_SCHEMA = stangObjekt({ ...SCHEMA_DEF.input_schema, description: SCHEMA_DEF.description });

export const PROMPT = `Du läser en svensk stämplingsrapport (en rotpost som ska säljas) och återger innehållet som JSON enligt det givna schemat.

DU LÄSER — DU RÄKNAR INTE. Skriv exakt det som står tryckt. Kontrollen görs efteråt av vanlig kod som summerar dina rader och jämför mot rapportens egna summor; därför får du ALDRIG justera en siffra för att få ihop en summa, fylla i en rad som inte syns eller ta bort en rad som ser konstig ut.

Så här gör du:
- Hitta tabellen "antal träd och volym per diameterklass" (kan heta Stämplingslängd, Stämplingslängd utökad, Diameterfördelning m.fl.). Rapporten kan ha en tabell per trädslag eller flera trädslag sida vid sida i spalter. Registrera EN post i "tradslag" för varje trädslag-tabell, med namnet som det står (Tall, Gran, Övrigt barr, Torra, …).
- Ta med varje diameterklass som har ett antal, med diameter, antal och volym m3sk (om tabellen har volym per klass; annars null). Klasser utan antal utelämnas. Rader som är summor, medelvärden eller höjder är inte klasser.
- "tryckt_antal" och "tryckt_volym_m3sk" är rapportens EGNA summor för trädslaget (raden Totalt, eller "Antal träd" / "Volym m3sk" under tabellen). Skriv dem som de står. Finns ingen summa för trädslaget: null.
- Är en spalt eller tabell diameterfördelning utan volym (bara antal) och en annan sida har samma trädslag med volym: använd den med volym per klass.
- "sammanfattning": siffrorna per trädslag från rapportens första sida eller löptext (t.ex. "tall 1433.2 m3sk, gran 449,9 m3sk och 0,8 m3sk torrträd"). Tom lista om sådana saknas.
- "post": postens namn, fastighet, markägare, stämplingsförrättare (förrättningsman), stämplingsdatum (ÅÅÅÅ-MM-DD) och rapportens totala volym i m3sk. null för det som inte finns.
- Är en siffra svårläst (särskilt i inskannade sidor): skriv din bästa läsning och lägg en rad i "osakerheter" med sida, trädslag och diameter. Gissa aldrig tyst.
- Dubbla spalter, vattenstämplar och handskrivna anteckningar: ta bara med det som är tryckt i tabellen.

Svara ENDAST med JSON enligt schemat — ingen text före eller efter.`;
