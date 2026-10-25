'use client';

// STÄMPLINGEN på en rotposts sida: vad stämplingslängden sa, mot vad skördaren fick ut.
//   läst rapport för trakten  → tabellen (timmer, kubb, massaved, totalt, träd) och EN mening som sammanfattar
//   olästa men finns från Vida → knappen "Läs stämplingslängden" (samma läsverktyg som Räkna, kostar en läsning)
//   ingen stämplingslängd      → en dämpad rad
// Prognosen räknas med stämplingssidans berakna() (lib/rotpost/stampling.ts). Ett fel är ett fel, aldrig "ingen".

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { AVSTAND, FARG, KNAPP, KORT, TYP } from '@/lib/design/tokens';
import { nf0, Rad, Rader, Mening } from '@/components/Ytform';
import type { Cell, Meta } from '@/lib/stampling/berakna';
import { lasFranObjekt, rapportForObjekt, type Rapport } from '@/lib/stampling/pdf/klient';
import { jamforStampling, narmastMening, procentMot } from '@/lib/rotpost/stampling';
import { utbyteVolymer } from '@/lib/stampling/pdf/rapport';
import type { Rotpost } from '@/lib/rotpost/uppfoljning';
import { stamplingsKalla } from '@/lib/rotpost/kalla';


type Lage =
  | { typ: 'laddar' }
  | { typ: 'fel'; text: string }
  | { typ: 'laser' }
  | { typ: 'saknas' }                                   // ingen stämplingslängd på trakten
  | { typ: 'olast'; gissad: boolean }                   // finns från Vida, inte läst
  | { typ: 'avviker'; rapport: Rapport }                // läst men kontrollen stämmer inte
  | { typ: 'klar'; rapport: Rapport; celler: Cell[]; meta: Meta; avverkad: boolean };

async function lasModell(): Promise<{ celler: Cell[]; meta: Meta } | null> {
  const [k, m] = await Promise.all([
    medAbortRetry(() => supabase.from('stamplings_klass').select('*')),
    medAbortRetry(() => supabase.from('stamplings_meta').select('nyckel,varde')),
  ]);
  if (k.error || m.error) return null;
  const celler = ((k.data ?? []) as Record<string, unknown>[]).map(r => ({
    slag: String(r.slag), klass: Number(r.klass), rot: r.rot as Cell['rot'], stammar: Number(r.stammar), objekt: Number(r.objekt),
    m3_per_stam: Number(r.m3_per_stam), timmer_pct: Number(r.timmer_pct), kubb_pct: Number(r.kubb_pct),
    massa_pct: Number(r.massa_pct), ovrigt_pct: Number(r.ovrigt_pct),
  }));
  const meta: Meta = {};
  for (const r of (m.data ?? []) as { nyckel: string; varde: string | number | null }[]) meta[r.nyckel] = r.varde == null ? null : Number(r.varde);
  return { celler, meta };
}

export default function StamplingDel({ r }: { r: Rotpost }) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });

  const visaRapport = useCallback(async (rapport: Rapport) => {
    if (rapport.status !== 'stammer' || !rapport.lasning) { setLage({ typ: 'avviker', rapport }); return; }
    const [modell, d] = await Promise.all([
      lasModell(),
      medAbortRetry(() => supabase.from('dim_objekt').select('skordning_avslutad').eq('objekt_id', r.id).limit(1).maybeSingle()),
    ]);
    if (!modell) { setLage({ typ: 'fel', text: 'Prognosmodellen kunde inte läsas.' }); return; }
    // Inte färdigavverkad: skördarens tal är bara en del av trakten och jämförelsen blir fel. Okänt (läsfel) räknas som klar.
    const avverkad = d.error ? true : !!(d.data as { skordning_avslutad?: string | null } | null)?.skordning_avslutad;
    setLage({ typ: 'klar', rapport, ...modell, avverkad });
  }, [r.id]);

  const hamta = useCallback(async () => {
    setLage({ typ: 'laddar' });
    const [rap, obj] = await Promise.all([
      rapportForObjekt(r.id),
      medAbortRetry(() => supabase.from('objekt').select('stamplingslangd_url,ovriga_dokument').eq('vo_nummer', r.id).limit(1).maybeSingle()),
    ]);
    if (!rap.ok) { setLage({ typ: 'fel', text: rap.fel }); return; }
    if (rap.rapport) { await visaRapport(rap.rapport); return; }
    if (obj.error) { setLage({ typ: 'fel', text: obj.error.message }); return; }
    const kalla = obj.data ? stamplingsKalla(obj.data as Parameters<typeof stamplingsKalla>[0]) : null;
    setLage(kalla ? { typ: 'olast', gissad: kalla.gissad } : { typ: 'saknas' });
  }, [r.id, visaRapport]);
  useEffect(() => { hamta(); }, [hamta]);

  async function las() {
    setLage({ typ: 'laser' });
    const res = await lasFranObjekt(r.id);
    if (!res.ok) { setLage({ typ: 'fel', text: res.fel }); return; }
    await visaRapport(res.rapport);
  }

  if (lage.typ === 'laddar') return <Rader rubrik="Stämplingen"><Rad text="Hämtar stämplingen…" dampad /></Rader>;
  if (lage.typ === 'saknas') return <Rader rubrik="Stämplingen"><Rad text="Ingen stämplingslängd på trakten" dampad /></Rader>;
  if (lage.typ === 'fel') return (
    <div style={{ ...KORT, margin: `${AVSTAND.l}px ${AVSTAND.l}px 0` }}>
      <div style={{ ...TYP.listtitel }}>Stämplingen kunde inte hämtas</div>
      <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>{lage.text}</div>
      <button onClick={hamta} style={KNAPP.sekundar}>Försök igen</button>
    </div>
  );
  if (lage.typ === 'olast' || lage.typ === 'laser') return (
    <div style={{ ...KORT, margin: `${AVSTAND.l}px ${AVSTAND.l}px 0` }}>
      <div style={{ ...TYP.listtitel }}>Stämplingslängden är inte läst</div>
      <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
        {lage.typ === 'laser' ? 'Läser… det kan ta en minut. Stäng inte sidan.'
          : lage.gissad ? 'Den är inskannad och läses av sig själv inom en timme. Är det fel fil säger läsningen det.'
          : 'Den läses av sig själv inom en timme. Vill du se den nu, tryck här.'}
      </div>
      <button onClick={las} disabled={lage.typ === 'laser'} style={{ ...KNAPP.primar, opacity: lage.typ === 'laser' ? 0.5 : 1 }}>
        {lage.typ === 'laser' ? 'Läser…' : 'Läs nu'}
      </button>
    </div>
  );
  if (lage.typ === 'avviker') return (
    <Rader rubrik="Stämplingen">
      <Rad text="Läsningen behöver kontrolleras" sub="Siffrorna i stämplingslängden går inte ihop. Rätta dem först."
        href={`/affarsuppfoljning/stampling?vy=pdf&id=${lage.rapport.id}&kor=1`} />
    </Rader>
  );

  // ── Läst: stämplingen mot skördaren ─────────────────────────────────────
  const j = jamforStampling(lage.rapport.lasning!, lage.celler, lage.meta);
  const p = j.prognos;
  // Tre tal per sortiment: det som blev (skördaren), det Vida skrev i rapportens utbyteskalkyl och det appen räknar.
  const kalkyl = lage.rapport.lasning!.utbyteskalkyl;
  const vida = utbyteVolymer(kalkyl);
  const rader: [string, number, number, number | null][] = [
    ['Timmer', r.m3.timmer, p.timmer, vida?.timmer ?? null], ['Kubb', r.m3.kubb, p.kubb, vida?.kubb ?? null],
    ['Massaved', r.m3.massa, p.massa, vida?.massa ?? null],
  ];
  const sa = (app: number, v: number | null) => [vida ? `Vida sa ${v == null ? '–' : nf0(v)}` : null, `appen sa ${nf0(app)}`].filter(Boolean).join(' · ');
  const narmast = narmastMening({ blev: r.m3.timmer, app: p.timmer, vida: vida?.timmer ?? null }, lage.avverkad);
  const tot = procentMot(r.volym, p.vol);
  const mening = !lage.avverkad ? 'Trakten är inte färdigavverkad än, så skördaren har bara en del av den. Jämför när skördningen är klar.'
    : narmast ?? (tot == null ? null : `Appen ${Math.abs(tot) <= 3 ? 'träffade volymen' : tot > 0 ? `räknade ${tot} % för lågt på volymen` : `räknade ${-tot} % för högt på volymen`}.`);
  const kalkylRad = kalkyl === undefined ? 'Vidas kalkyl är inte utläst ur rapporten än.'
    : kalkyl === null || !vida ? 'Rapporten har ingen utbyteskalkyl från Vida.' : null;

  return (
    <>
      <Rader rubrik="Vad blev det, mot vad som sades?">
        {rader.map(([namn, fakt, app, v]) => (
          <Rad key={namn} text={namn} tal={`${nf0(fakt)} m³`} sub={sa(app, v)} />
        ))}
        <Rad text="Totalt" tal={`${nf0(r.volym)} m³`} sub={sa(p.vol, vida?.total ?? null)} />
        <Rad text="Träd" tal={nf0(r.stammar)} sub={`stämplat ${nf0(j.trad + j.utanforModellen)}`} />
        <Rad text="Stämplingslängden" sub="Trädslag, klasser och rötan" href={`/affarsuppfoljning/stampling?vy=pdf&id=${lage.rapport.id}&kor=1`} />
      </Rader>
      {mening && <div style={{ margin: `0 ${AVSTAND.l}px` }}><Mening>{mening}</Mening></div>}
      <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.l}px 0` }}>
        {[j.forrattare, j.datum].filter(Boolean).join(' · ')}{j.forrattare || j.datum ? ' · ' : ''}
        Vida sa = rapportens utbyteskalkyl. Appen sa = stämplingslängden räknad mot vår avverkade skog. Allt i m³fub.
        {kalkylRad ? ` ${kalkylRad}` : ''}
        {j.utanforModellen > 0 ? ` ${nf0(j.utanforModellen)} träd (löv, torra) räknas inte i prognosen.` : ''}
      </div>
    </>
  );
}
