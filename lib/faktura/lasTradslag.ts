// TRÄDSLAG PER SORTIMENT på en trakt — "Timmer Vislanda Tall · Tall 100 %",
// "Massa BmavFall · Gran 62 % · Tall 38 %".
//
// VARFÖR (Martin 2026-10-25, med Bågskyttebanan uppe: "kan du speca upp tall
// gran så man ser dom olika sortimenten"): maskinens sortimentsnamn säger
// trädslaget ibland ("Vislanda Tall", "Engved3mGran") och ibland inte
// ("Kubb Alvesta275", "Massa BmavFall"). Namnet är ingen källa — trädslaget
// står i datan, och det är det som avgör om två rader är två sortiment eller
// samma virke i två längder.
//
// VAR DET BOR: trädslaget sitter på STAMMEN (detalj_stam.tradslag_id),
// sortimentet på STOCKEN (detalj_stock.sortiment_id). Ingen av dem bär bådaIn,
// så det krävs en join — samma som markägarrapporten gör, med samma
// sortering.
//
// ⚠️ ALDRIG bara .order('id') på detalj_stock/detalj_stam: då går Postgres
// längs primärnyckeln genom hela tabellen och filtrerar på objektet, och ett
// objekt vars rader ligger sent slår i statement timeout (Akelius Tåget,
// 19 631 stockar, kraschade markägarrapporten 2026-10-21). (filnamn, id)
// följer indexet (objekt_id, filnamn).
//
// DEN HÄR LÄSNINGEN FÅR ALDRIG SINKA ETT PRIS. Den ligger utanför
// hamtaVoUnderlag och körs först när granskningen öppnas; faller den visas
// listan utan trädslag och raden säger varför. Inget tal i fakturan rör den.

import { fetchAllRows } from '@/lib/ekonomi/period';
import { normalizeTradslag, tradslagDisplay } from '@/lib/markagarrapport/detect';

type SB = { from: (t: string) => any };

export type TradslagsAndel = {
  /** "Gran", "Tall", "Björk", "Övr löv" — appens enda trädslagsord. */
  namn: string;
  volym: number;
};

/** sortiment_id → trädslagen i det sortimentet, störst först. */
export type TradslagPerSortiment = Record<string, TradslagsAndel[]>;

/**
 * Volym per (sortiment, trädslag) för hela VO-gruppen.
 *
 * Stockar utan stam (parserns kopior från april–maj 2026) och stammar utan
 * trädslag räknas inte — de skulle annars bli ett påhittat "Okänt" som ser ut
 * som ett eget trädslag. Att en del av volymen saknar trädslag syns på att
 * andelarna inte summerar till sortimentets volym; vyn räknar procent på det
 * den VET, och säger det.
 */
export async function hamtaTradslagPerSortiment(
  sb: SB, objektIds: string[],
): Promise<TradslagPerSortiment> {
  if (objektIds.length === 0) return {};

  type Stock = { maskin_id: string; stem_key: string | null; log_key: number | null; sortiment_id: string | null; volym_m3sub: number | string | null };
  type Stam = { maskin_id: string; stam_key: string; tradslag_id: string | null };

  const [stockar, stammar] = await Promise.all([
    fetchAllRows((f, t) => sb.from('detalj_stock')
      .select('maskin_id, stem_key, log_key, sortiment_id, volym_m3sub')
      .in('objekt_id', objektIds)
      .not('stem_key', 'is', null)
      .not('log_key', 'is', null)
      .order('filnamn').order('id').range(f, t)) as Promise<Stock[]>,
    fetchAllRows((f, t) => sb.from('detalj_stam')
      .select('maskin_id, stam_key, tradslag_id')
      .in('objekt_id', objektIds)
      .order('filnamn').order('id').range(f, t)) as Promise<Stam[]>,
  ]);

  const tradslagIds = Array.from(new Set(
    stammar.map(s => s.tradslag_id).filter((t): t is string => !!t)));
  const namnPerId = new Map<string, string>();
  if (tradslagIds.length) {
    const { data, error } = await sb.from('dim_tradslag')
      .select('tradslag_id, namn').in('tradslag_id', tradslagIds);
    if (error) throw new Error('Kunde inte läsa trädslag: ' + error.message);
    for (const t of data || []) {
      const n = tradslagDisplay(normalizeTradslag(t.namn));
      if (n) namnPerId.set(t.tradslag_id, n);
    }
  }

  // Stammen slås upp per MASKIN: stam_key numreras om per maskin, så två
  // maskiner på samma trakt kan ha samma nyckel på olika stammar.
  const artPerStam = new Map<string, string>();
  for (const s of stammar) {
    const art = s.tradslag_id ? namnPerId.get(s.tradslag_id) : undefined;
    if (art) artPerStam.set(`${s.maskin_id}|${s.stam_key}`, art);
  }

  // Dedupe på (maskin, stam, stock): HPR-filerna är kumulativa och importen
  // UPSERT:ar på just den nyckeln, men en gammal rad utan constraint får
  // aldrig dubbla en volym här.
  const sedda = new Set<string>();
  const per = new Map<string, Map<string, number>>();
  for (const st of stockar) {
    if (!st.sortiment_id) continue;
    const nyckel = `${st.maskin_id}|${st.stem_key}|${st.log_key}`;
    if (sedda.has(nyckel)) continue;
    sedda.add(nyckel);
    const art = artPerStam.get(`${st.maskin_id}|${st.stem_key}`);
    if (!art) continue;
    const v = Number(st.volym_m3sub) || 0;
    if (v <= 0) continue;
    let m = per.get(st.sortiment_id);
    if (!m) { m = new Map(); per.set(st.sortiment_id, m); }
    m.set(art, (m.get(art) ?? 0) + v);
  }

  const ut: TradslagPerSortiment = {};
  for (const [sid, m] of per) {
    ut[sid] = Array.from(m, ([namn, volym]) => ({ namn, volym }))
      .sort((a, b) => b.volym - a.volym);
  }
  return ut;
}
