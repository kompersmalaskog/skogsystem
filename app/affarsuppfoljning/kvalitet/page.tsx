'use client';

// MASSAVEDENS LÄNGD — en sida under Året (raden "Massavedens längd" i Översikten; var fliken Kvalitet till 2026-10-25): massavedens längd för Vida, månad för månad, objekten sämst
// först (massaved_niva1 är redan filtrerad på bolag = 'Vida' och sorterad på lägst medellängd). Byggd mot förlagan:
// "Augusti ⌄", medellängden stor, "medellängd barrmassaved", i gult
// "9 av 14 objekt under 4,6 m", "barr ⌄", sedan en rad per objekt med
// medellängden intill namnet i färg och kubiken längst ut.
//
// Ett tryck på ett objekt öppnar traktens massaved (/affarsuppfoljning/objekt/<id>?vy=massaved) — samma skärm oavsett om man kommer hit eller
// från en månad. Därifrån: 3 m-stockar, sågbar dimension, längre rotkap.
//
// Månaden följer MED i länken så objektskärmen öppnar på samma tal som raden.
// Objekt utan bolag räknas INTE in i talet men göms inte heller: de ligger
// sist, dämpade.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { AVSTAND, FARG, KORT, RADIE, TYP } from '@/lib/design/tokens';
import { SIDA, GUL, GRON, DAMPAD, MUTED, LINJE, nf0, nf1, nf2, manadNamn, manadEtikett, stor, stegaManad, nuManad, kortObjekt,
         Rubrikrad, Tillbakarad, Stort, Tillstand, Kontroll, Rad, Rader, Laddar, Fel } from '@/components/Ytform';

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

  const valjManad = (m: string) => { setManad(m); router.replace(`/affarsuppfoljning/kvalitet?manad=${m}`, { scroll: false }); };
  const mal = data?.mal_m ?? 4.6;
  // En trakt med noll kubik i månaden (avrundat) säger inget om längden — den visas inte.
  const synliga = (data?.objekt ?? []).filter(o => Math.round(o.m3fub) > 0);

  const valtaKontroll = (
    <Kontroll text={valta.toLowerCase()} value={valta} onChange={v => setValta(v as typeof VALTOR[number])} label="Välta">
      {VALTOR.map(v => <option key={v} value={v}>{v}</option>)}
    </Kontroll>
  );

  const rad = (o: ObjektRad, gra: boolean) => (
    <Rad key={o.objekt_id} href={`/affarsuppfoljning/objekt/${encodeURIComponent(o.objekt_id)}?vy=massaved&manad=${manad}`}
      text={kortObjekt(o.namn ?? o.objekt_id)} dampad={gra}
      tal={nf2(o.medellangd_m)} farg={gra ? DAMPAD : o.medellangd_m < mal ? GUL : GRON}
      hoger={`${nf0(o.m3fub)} m³`} />
  );

  return (
    <div style={SIDA}>
      <Tillbakarad href="/affarsuppfoljning" text="Året" />
      <Rubrikrad text={stor(manadNamn(manad))} value={manad} onChange={valjManad} label="Månad">
        {manadLista().map(m => <option key={m} value={m}>{stor(manadEtikett(m))}</option>)}
      </Rubrikrad>

      {laddar && <Laddar vad={manadEtikett(manad)} />}
      {!laddar && fel && <Fel rubrik="Längderna kunde inte hämtas" fel={fel} igen={hamta} />}

      {!laddar && !fel && data && (
        <>
          {data.medellangd_m != null ? (
            <Stort tal={nf2(data.medellangd_m)} enhet="m" ordrad={`medellängd på ${valta.toLowerCase()}massaveden · Vida vill ha ${nf1(mal)} m`}>
              {/* Stapeln mot målet: man ser utan att räkna om det fattas. Färgen förstärker meningen under, aldrig ensam. */}
              <div aria-hidden style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.linje, marginTop: AVSTAND.m }}>
                <div style={{ height: '100%', borderRadius: RADIE.stapel, width: `${Math.min(100, (100 * data.medellangd_m) / mal)}%`,
                              background: data.medellangd_m < mal ? GUL : GRON }} />
              </div>
              {data.medellangd_m < mal
                ? <Tillstand farg={GUL}>Massaveden är för kort · {data.antal_under_mal} av {data.antal_objekt} trakter under {nf1(mal)} m</Tillstand>
                : <Tillstand farg={GRON}>Massaveden håller måttet{data.antal_under_mal > 0 ? ` · ${data.antal_under_mal} av ${data.antal_objekt} trakter under` : ''}</Tillstand>}
              {valtaKontroll}
            </Stort>
          ) : (
            <div style={{ ...KORT, margin: `${AVSTAND.m}px ${AVSTAND.l}px 0` }}>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>Ingen {valta.toLowerCase()}massaved i {manadEtikett(manad)}.</div>
              {valtaKontroll}
            </div>
          )}

          {(synliga.length > 0 || data.utan_bolag.length > 0) && (
            <Rader rubrik="Kortast först">
              {synliga.map(o => rad(o, false))}
              {data.utan_bolag.length > 0 && (
                <>
                  <div style={{ ...MUTED, padding: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, borderTop: LINJE }}>Saknar bolag — räknas inte in i talet</div>
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
