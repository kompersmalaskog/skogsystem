'use client';

// NIVÅ 1 — massavedens längd, månad för månad. Byggd mot förlagan:
// "Augusti ⌄", medellängden stor, "medellängd barrmassaved", i gult
// "9 av 14 objekt under 4,6 m", "barr ⌄", sedan en rad per objekt med
// medellängden intill namnet i färg och kubiken längst ut.
//
// Månaden följer MED i länken så nivå 2 öppnar på samma tal som raden.
// Objekt utan bolag räknas INTE in i talet men göms inte heller: de ligger
// sist, dämpade.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, GUL, GRON, DAMPAD, MUTED, nf0, nf1, nf2, manadNamn, manadEtikett, stor, stegaManad, nuManad, kortObjekt,
         Rubrikrad, Stort, Tillstand, Kontroll, Rad, Rader, Laddar, Fel } from './form';

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

  const valtaKontroll = (
    <Kontroll text={valta.toLowerCase()} value={valta} onChange={v => setValta(v as typeof VALTOR[number])} label="Välta">
      {VALTOR.map(v => <option key={v} value={v}>{v}</option>)}
    </Kontroll>
  );

  const rad = (o: ObjektRad, gra: boolean) => (
    <Rad key={o.objekt_id} href={`/massaved/${encodeURIComponent(o.objekt_id)}?manad=${manad}`}
      text={kortObjekt(o.namn ?? o.objekt_id)} dampad={gra}
      tal={nf2(o.medellangd_m)} farg={gra ? DAMPAD : o.medellangd_m < mal ? GUL : GRON}
      hoger={`${nf0(o.m3fub)} m³`} />
  );

  return (
    <div style={SIDA}>
      <Rubrikrad text={stor(manadNamn(manad))} value={manad} onChange={valjManad} label="Månad">
        {manadLista().map(m => <option key={m} value={m}>{stor(manadEtikett(m))}</option>)}
      </Rubrikrad>

      {laddar && <Laddar vad={manadEtikett(manad)} />}
      {!laddar && fel && <Fel rubrik="Längderna kunde inte hämtas" fel={fel} igen={hamta} />}

      {!laddar && !fel && data && (
        <>
          {data.medellangd_m != null ? (
            <Stort tal={nf2(data.medellangd_m)} enhet="m" ordrad={`medellängd ${valta.toLowerCase()}massaved`}>
              {data.antal_under_mal > 0
                ? <Tillstand farg={GUL}>{data.antal_under_mal} av {data.antal_objekt} objekt under {nf1(mal)} m</Tillstand>
                : <Tillstand farg={GRON}>alla {data.antal_objekt} objekt når {nf1(mal)} m</Tillstand>}
              {valtaKontroll}
            </Stort>
          ) : (
            <div style={{ padding: '10px 16px 0' }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>Ingen {valta.toLowerCase()}massaved i {manadEtikett(manad)}.</div>
              {valtaKontroll}
            </div>
          )}

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
