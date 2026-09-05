'use client';

// NIVÅ 1 — massavedens längd, månad för månad. Samma form som nivå 2 och
// undernivåerna (se form.tsx): rubrikrad med månadsväljare, medellängden
// stor, ordraden, Vida-raden, vältan som kontroll, storleken dämpad, sedan
// en rad per objekt med medellängden som talet — det avgör om man trycker.
//
// Månaden följer MED i länken. Nivå 2 öppnar på samma tal som raden man
// tryckte på — annars uppstår en tankelucka.
//
// Maskinen är en grå ETIKETT på raden, aldrig ett filter. Objekt utan bolag
// räknas INTE in i talet men göms inte heller: de ligger sist, dämpade.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, GUL, GRON, SEKUNDAR, MUTED, nf0, nf1, nf2, manadEtikett, stor, stegaManad, nuManad, utanPrefix,
         Rubrikrad, Stort, Tillstand, Damp, Kontroll, Rad, Rader, Laddar, Fel } from '../massaved/form';

type ObjektRad = {
  objekt_id: string; namn: string | null; status: string;
  medellangd_m: number; m3fub: number; maskiner: string | null;
};
type Niva1 = {
  manad: string; valta: string; mal_m: number;
  medellangd_m: number | null; total_m3fub: number;
  antal_objekt: number; antal_under_mal: number;
  objekt: ObjektRad[]; utan_bolag: ObjektRad[];
};

const VALTOR = ['Barr', 'Björk'] as const;

/** Två år bakåt. Datans egen början känner den här nivån inte till. */
function manadLista() {
  const ut: string[] = [];
  for (let m = nuManad(), i = 0; i < 24; m = stegaManad(m, -1), i++) ut.push(m);
  return ut;
}

function Innehall() {
  const sp = useSearchParams();
  const router = useRouter();
  const [manad, setManad] = useState(sp.get('manad') || nuManad());
  const [valta, setValta] = useState<typeof VALTOR[number]>('Barr');
  const [data, setData] = useState<Niva1 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    // medAbortRetry: supabase-js auth-lås kan avbryta anropet transient.
    const { data, error } = await medAbortRetry(() =>
      supabase.rpc('massaved_niva1', { p_manad: `${manad}-01`, p_valta: valta }));
    // Ett fel får aldrig se ut som noll längd — och felet ska BEHÅLLAS.
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setData(null);
    } else setData(data as Niva1);
    setLaddar(false);
  }, [manad, valta]);

  useEffect(() => { hamta(); }, [hamta]);

  const valjManad = (m: string) => { setManad(m); router.replace(`/massaved?manad=${m}`, { scroll: false }); };
  const mal = data?.mal_m ?? 4.6;

  const rad = (o: ObjektRad, gra: boolean) => {
    const under = o.medellangd_m < mal;
    return (
      <Rad key={o.objekt_id} href={`/massaved/${encodeURIComponent(o.objekt_id)}?manad=${manad}`}
        text={utanPrefix(o.namn ?? o.objekt_id)} dampad={gra}
        sub={<>
          {gra ? 'saknar bolag' : <span style={{ color: under ? GUL : GRON, fontWeight: 600 }}>{under ? 'under' : 'når'} {nf1(mal)} m</span>}
          {' · '}{nf1(o.m3fub)} m³fub{o.maskiner && <> · {o.maskiner}</>}
        </>}
        tal={nf2(o.medellangd_m)} enhet="m" farg={gra ? SEKUNDAR : under ? GUL : GRON} />
    );
  };

  return (
    <div style={SIDA}>
      <Rubrikrad text={stor(manadEtikett(manad))} value={manad} onChange={valjManad} label="Månad">
        {manadLista().map(m => <option key={m} value={m}>{stor(manadEtikett(m))}</option>)}
      </Rubrikrad>

      {laddar && <Laddar vad={manadEtikett(manad)} />}
      {!laddar && fel && <Fel rubrik="Längderna kunde inte hämtas" fel={fel} igen={hamta} />}

      {!laddar && !fel && data && (
        <>
          <div style={{ padding: '18px 16px 0' }}>
            {data.medellangd_m != null ? (
              <Stort tal={nf2(data.medellangd_m)} enhet="m" ordrad={`medellängd ${valta.toLowerCase()}massaved`}>
                <Tillstand farg={data.medellangd_m < mal ? GUL : GRON}>
                  {data.medellangd_m < mal ? 'under' : 'når'} Vidas önskade {nf1(mal)} m
                </Tillstand>
                <Kontroll text={valta.toLowerCase()} value={valta} onChange={v => setValta(v as typeof VALTOR[number])} label="Välta">
                  {VALTOR.map(v => <option key={v} value={v}>{v}</option>)}
                </Kontroll>
                <Damp>
                  {data.antal_objekt} objekt · {nf0(data.total_m3fub)} m³fub
                  {data.antal_under_mal > 0 && <> · {data.antal_under_mal} under {nf1(mal)} m</>}
                </Damp>
              </Stort>
            ) : (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>Ingen {valta.toLowerCase()}massaved i {manadEtikett(manad)}.</div>
                <Kontroll text={valta.toLowerCase()} value={valta} onChange={v => setValta(v as typeof VALTOR[number])} label="Välta">
                  {VALTOR.map(v => <option key={v} value={v}>{v}</option>)}
                </Kontroll>
              </>
            )}
          </div>

          {(data.objekt.length > 0 || data.utan_bolag.length > 0) && (
            <Rader>
              {data.objekt.map(o => rad(o, false))}
              {data.utan_bolag.length > 0 && (
                <>
                  <div style={{ ...MUTED, padding: '14px 0 6px' }}>Räknas inte in i talet ovan</div>
                  {data.utan_bolag.map(o => rad(o, true))}
                </>
              )}
            </Rader>
          )}
        </>
      )}
    </div>
  );
}

export default function Massaved() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
