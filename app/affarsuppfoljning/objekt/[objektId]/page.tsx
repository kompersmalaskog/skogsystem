'use client';

// TRAKTSIDAN och MASSAVEDENS NIVÅER. Utan ?vy= visas traktsidan (TraktVy.tsx: allt om trakten på ett ställe — dit leder Trakter,
// Kvalitet, månaden och Räkna). Med ?vy= visas massavedens nivåer nedan. Undersidor: /bitar (bitarna) och /rotkap (längre rotkap).
// Gamla adresser (/massaved/<id>, /rotkap?objekt=, /affarsuppfoljning/rotposter?id=) leder hit.
// Vilken nivå som visas styrs av ?vy= i länken, så att bakåtknappen och delade länkar fungerar:
//   vy=massaved      massaveden: "Ulfsnäs AU ⌄", 4,03 m, medellängd
//                    barrmassaved, under Vidas önskade 4,6 m, augusti ⌄,
//                    179,8 m³fub · 1 589 bitar, sedan raderna
//   vy=tre-m         3 m-stockar: 26 %, Utan dem, Rötan fortsatte, Visa bitarna
//   vy=langd         längdfördelning: 42 % når 4,6 m, staplar per klass
//   vy=sagbar        sågbar dimension: 21 %, ett sortiment per rad
//   vy=sortiment     ett sortiment: volymen, Längd, Diameter, Visa bitarna,
//                    tekniskt längst ner (&sort=namn)
//   vy=sagbar-rakning, vy=rakning   texterna, en nivå in
//   vy=tradslag      trädslag och avkap — avkapets 3 dm och 6 dm bor här
//
// Omfånget: ?manad=YYYY-MM är månaden, saknas den eller är "alla" gäller
// hela objektet. Månaden ärvs från raden man tryckte på i nivå 1.
//
// Färg betyder något: gult 3 m-stockar, grönt når målet, grått allt annat.
// Rör inga beräkningar: allt här är omflyttning av det som redan hämtas,
// plus en läsning av sim_rotkap för antalet stammar där rötan fortsatte.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, GUL, GRON, TEXT, DAMPAD, nf0, nf1, nf2, manadNamn, manadEtikett, stor, kortObjekt,
         Rubrik, Tillbakarad, Stort, Tillstand, Damp, Kontroll, Mening, Rad, Rader, Stycken, Laddar, Fel } from '@/components/Ytform';
import { AVSTAND, FARG, RADIE } from '@/lib/design/tokens';
import { sortimentEtiketter } from '@/lib/massaved/sortimentnamn';
import TraktVy from './TraktVy';

type Tradslag = { namn: string; m3fub: number; medellangd_m: number; sagbar_m3: number };
type Valta = { valta: string; m3fub: number; medellangd_m: number; antal_tradslag: number; tradslag: Tradslag[] };
type Klass = { klass: string; ordning: number; niva: 'tre_m' | 'under_mal' | 'over_mal'; m3fub: number; st: number; varav_tre_m_st: number; andel: number };
type SagbartSortiment = {
  namn: string; grupp: string; langd_min_m: number; langd_max_m: number | null;
  dia_min_mm: number; dia_max_mm: number; kalla: 'hpr' | 'harledd'; m3fub: number;
};
type Niva2 = {
  objekt_id: string; namn: string | null; status: string;
  omfang: 'manad' | 'objekt'; manad: string | null; manader: string[];
  period_fran: string | null; period_till: string | null;
  onskad_medellangd_m: number;
  medellangd_m: number | null; total_m3fub: number;
  tre_m_stock: { m3fub: number; st: number; andel: number | null; medellangd_utan_m3: number | null };
  sagbar: {
    m3fub: number; andel: number | null; sortiment: SagbartSortiment[];
    overlapp_m3: number; antal_ur_maskinen: number; antal_harledda: number;
  };
  avkap: { st: number; m3fub: number; delar: { kap: string; st: number; m3fub: number }[] };
  valtor: Valta[]; langdfordelning: Klass[];
  hemved_m3: number;
  massa_utan_sagbar_stock_m3: number; massa_utan_sagbar_stock_st: number;
};
type Rotkap = { stammar: number; grupp2_stammar: number };

/** Sortimentets korta, unika namn ("Kubb: Alvesta305_V3" → "Kubb Alvesta 305"). Hela maskinnamnet står i Så räknas. Regeln bor i
 *  lib/massaved/sortimentnamn.ts. */
const kortSortiment = (so: SagbartSortiment, alla: SagbartSortiment[]) => sortimentEtiketter(alla)[Math.max(0, alla.findIndex(x => x.namn === so.namn))];
const klassFarg = (n: Klass['niva']) => n === 'tre_m' ? GUL : n === 'over_mal' ? GRON : DAMPAD;

function Innehall() {
  const params = useParams();
  const sp = useSearchParams();
  const router = useRouter();
  const objektId = decodeURIComponent(String(params.objektId));
  const manadParam = sp.get('manad');
  const manad = manadParam && manadParam !== 'alla' ? manadParam : null;
  const vy = sp.get('vy');
  const sort = sp.get('sort');

  const [d, setD] = useState<Niva2 | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);
  const [rotkap, setRotkap] = useState<Rotkap | null>(null);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() =>
      supabase.rpc('massaved_niva2', { p_objekt_id: objektId, p_manad: manad ? `${manad}-01` : null }));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setD(null);
    } else setD(data as Niva2);
    setLaddar(false);
  }, [objektId, manad]);

  useEffect(() => { hamta(); }, [hamta]);

  // Rotkapssimuleringen är redan räknad (sim_rotkap, raden för 3,0 m). Här
  // läses bara hur många stammar där rötan fortsatte. Saknas raden: ingen rad.
  useEffect(() => {
    supabase.from('sim_rotkap').select('stammar,grupp2_stammar')
      .eq('objekt_id', objektId).eq('kaplangd_cm', 300).maybeSingle()
      .then(({ data }) => setRotkap((data as Rotkap | null) ?? null));
  }, [objektId]);


  const namn = kortObjekt(d?.namn ?? objektId);
  const periodOrd = manad ? manadNamn(manad) : 'hela trakten';
  const bas = `/affarsuppfoljning/objekt/${encodeURIComponent(objektId)}`;
  const url = (q: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    p.set('manad', manad ?? 'alla');
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return `${bas}?${p.toString()}`;
  };
  const go = (v: string, s?: string) => router.push(url({ vy: v, sort: s }));
  const objektUrl = url({ vy: 'massaved' });
  const traktUrl = bas;
  const rotkapUrl = `${bas}/rotkap`;
  const bitarUrl = `${bas}/bitar`;
  const har = 'Massaveden';

  if (laddar) return <div style={SIDA}><Tillbakarad href={bas} text={namn} /><Laddar vad="massaveden" /></div>;
  if (fel) return <div style={SIDA}><Tillbakarad href={bas} text={namn} /><Fel rubrik="Massaveden kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (!d) return <div style={SIDA} />;

  const onskad = d.onskad_medellangd_m;
  const bitar = d.langdfordelning.reduce((s, k) => s + k.st, 0);
  const overMal = d.langdfordelning.filter(k => k.niva === 'over_mal').reduce((s, k) => s + k.andel, 0);
  const maxAndel = Math.max(1e-9, ...d.langdfordelning.map(k => k.andel));
  const storstaValta = [...d.valtor].sort((a, b) => b.m3fub - a.m3fub)[0];
  const valtaOrd = storstaValta ? `${storstaValta.valta.toLowerCase()}massaved` : 'massaved';
  const under = d.medellangd_m != null && d.medellangd_m < onskad;
  const periodKontroll = (
    <Kontroll text={periodOrd} value={manad ?? 'alla'} label="Period"
      onChange={m => router.replace(`${bas}?vy=massaved&manad=${m}`, { scroll: false })}>
      {d.manader.map(m => <option key={m} value={m}>{stor(manadEtikett(m))}</option>)}
      <option value="alla">Hela trakten</option>
    </Kontroll>
  );

  // ── Massaveden ────────────────────────────────────────────────────────
  if (vy === 'massaved') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={traktUrl} text={namn} />
        <Rubrik>Massaveden</Rubrik>

        {d.medellangd_m == null ? (
          <Stort tal="–" ordrad={`ingen massaved${manad ? ` i ${manadEtikett(manad)}` : ''}`}>
            {d.manader.length > 0 && periodKontroll}
          </Stort>
        ) : (
          <>
            <Stort tal={nf2(d.medellangd_m)} enhet="m" ordrad={`lång i snitt · Vida vill ha ${nf1(onskad)} m`}>
              {/* Stapeln mot Vidas mått: man ser utan att räkna om det fattas. Färgen förstärker meningen, aldrig ensam. */}
              <div aria-hidden style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.linje, marginTop: AVSTAND.m }}>
                <div style={{ height: '100%', borderRadius: RADIE.stapel, width: `${Math.min(100, (100 * d.medellangd_m) / onskad)}%`,
                              background: under ? GUL : GRON }} />
              </div>
              <Tillstand farg={under ? GUL : GRON}>
                {under ? `${nf2(onskad - d.medellangd_m)} m för kort` : 'Håller Vidas mått'}
              </Tillstand>
              <Damp>{nf0(d.total_m3fub)} m³ {valtaOrd}</Damp>
              {periodKontroll}
            </Stort>

            <Rader rubrik="Varför">
              <Rad text="Hur långa bitarna är" sub={`${nf0(overMal)} % är ${nf1(onskad)} m eller längre`} onClick={() => go('langd')} />
              {d.tre_m_stock.st > 0 && (
                <Rad text="Korta rotbitar" sub={`${nf0(d.tre_m_stock.andel ?? 0)} % är 3 m-bitar som kapats för röta`} onClick={() => go('tre-m')} />
              )}
              {d.sagbar.sortiment.length > 0 && (
                <Rad text="Kunde ha blivit timmer eller kubb" sub={`${nf0(d.sagbar.andel ?? 0)} % hade passat ett sågbart sortiment`} onClick={() => go('sagbar')} />
              )}
              <Rad text="Per trädslag" onClick={() => go('tradslag')} />
            </Rader>
            <Rader>
              <Rad text="Så räknas" onClick={() => go('rakning')} dampad />
            </Rader>
          </>
        )}
      </div>
    );
  }

  // ── 3 m-stockar ───────────────────────────────────────────────────────
  if (vy === 'tre-m') {
    const t = d.tre_m_stock;
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf0(t.andel ?? 0)} enhet="%" ordrad="av massaveden är korta rotbitar">
          <Damp>{nf0(t.st)} st · {nf1(t.m3fub)} m³fub</Damp>
          <Mening>Bitar på 3 m som maskinen kapat längst ner på stammen för att få bort röta.</Mening>
        </Stort>
        <Rader>
          {t.medellangd_utan_m3 != null && <Rad text="Utan dem" tal={`${nf2(t.medellangd_utan_m3)} m`} farg={GRON} />}
          {rotkap && rotkap.grupp2_stammar > 0 && (
            <Rad text="Rötan fortsatte" tal={`${nf0(rotkap.grupp2_stammar)} st`} href={rotkapUrl} />
          )}
          <Rad text="Visa bitarna" href={bitarUrl} />
        </Rader>
      </div>
    );
  }

  // ── Längdfördelning ───────────────────────────────────────────────────
  if (vy === 'langd') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf0(overMal)} enhet="%" ordrad={`är ${nf1(onskad)} m eller längre`}>
          <Damp>{nf1(d.total_m3fub)} m³fub · {nf0(bitar)} bitar</Damp>
        </Stort>
        <Rader>
          {d.langdfordelning.map(k => (
            <Rad key={k.klass} text={k.klass} tal={`${nf1(k.andel)} %`}
              farg={k.niva === 'under_mal' ? TEXT : klassFarg(k.niva)}
              hoger={`${nf1(k.m3fub)} m³`}
              stapel={{ andel: k.andel, max: maxAndel, farg: klassFarg(k.niva) }} />
          ))}
          <Rad text="Visa bitarna" href={bitarUrl} />
        </Rader>
      </div>
    );
  }

  // ── Sågbar dimension ──────────────────────────────────────────────────
  if (vy === 'sagbar') {
    const s = d.sagbar;
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf0(s.andel ?? 0)} enhet="%" ordrad="hade passat som timmer eller kubb">
          <Damp>{nf1(s.m3fub)} m³fub</Damp>
        </Stort>
        <Rader>
          {/* Största först, som i förlagan. Sortiment utan volym (0,0 m³) är brus och visas inte. */}
          {[...s.sortiment].filter(so => so.m3fub >= 0.05).sort((a, b) => b.m3fub - a.m3fub).map(so => (
            <Rad key={so.namn} text={kortSortiment(so, s.sortiment)} tal={`${nf1(so.m3fub)} m³`} onClick={() => go('sortiment', so.namn)} />
          ))}
          <Rad text="Så räknas" onClick={() => go('sagbar-rakning')} />
        </Rader>
      </div>
    );
  }

  // ── Ett sortiment ─────────────────────────────────────────────────────
  if (vy === 'sortiment') {
    const so = d.sagbar.sortiment.find(x => x.namn === sort);
    const sagbarUrl = url({ vy: 'sagbar' });
    if (!so) return <div style={SIDA}><Tillbakarad href={sagbarUrl} text="Sågbar dimension" /><Stycken>Sortimentet finns inte i det här omfånget.</Stycken></div>;
    const urMaskinen = so.kalla === 'hpr' && so.langd_max_m != null;
    const andel = d.total_m3fub > 0 ? (100 * so.m3fub) / d.total_m3fub : 0;
    return (
      <div style={SIDA}>
        <Tillbakarad href={sagbarUrl} text="Sågbar dimension" />
        <Stort tal={nf1(so.m3fub)} enhet="m³" ordrad={`hade rymts i ${kortSortiment(so, d.sagbar.sortiment)}`}>
          <Damp>{nf1(andel)} % av massaveden</Damp>
        </Stort>
        <Rader>
          <Rad text="Längd" tal={urMaskinen ? `${nf2(so.langd_min_m)}–${nf2(so.langd_max_m as number)} m` : `från ${nf2(so.langd_min_m)} m`} />
          <Rad text="Diameter" tal={`${nf0(so.dia_min_mm)}–${nf0(so.dia_max_mm)} mm`} />
          <Rad text="Visa bitarna" href={bitarUrl} />
          <Rad text="Så räknas" onClick={() => go('sagbar-rakning', so.namn)} />
        </Rader>
      </div>
    );
  }

  // ── Så räknas sågbart ─────────────────────────────────────────────────
  if (vy === 'sagbar-rakning') {
    const s = d.sagbar;
    const fran = sort ? s.sortiment.find(x => x.namn === sort) : undefined;
    return (
      <div style={SIDA}>
        <Tillbakarad href={fran ? url({ vy: 'sortiment', sort: fran.namn }) : url({ vy: 'sagbar' })}
          text={fran ? kortSortiment(fran, s.sortiment) : 'Sågbar dimension'} />
        <Stycken>
          {fran && (
            <p style={{ margin: '0 0 8px' }}>
              {fran.kalla === 'hpr' && fran.langd_max_m != null
                ? 'Gränserna kommer ur maskinen.'
                : 'De undre gränserna kommer ur prislistan, taket är härlett ur högsta prisklassen.'}
              {' '}I maskinen heter sortimentet {fran.namn}.
            </p>
          )}
          <p style={{ margin: '0 0 8px' }}>
            Sågbar dimension kräver att biten ryms i båda gränserna för ett sortiment, längd och diameter,
            som den redan är kapad. Regeln är alltså &quot;biten är en sågbar stock&quot;, inte &quot;biten hade
            kunnat ge en sågbar stock&quot;.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            Det får en följd som ser konstig ut tills man vet den: kubben är en fastlängdsprodukt, 3,05–3,25 m.
            En grov massavedsstock på 4,80 m och 150 mm räknas därför inte som kubbdimension, trots att en
            3,05-kubb hade gått att kapa ur den.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            Fönstren kommer ur objektets egna sortiment. {s.antal_ur_maskinen} av {s.antal_ur_maskinen + s.antal_harledda} är
            lästa ur maskinens fil; för de andra är taket härlett ur prislistan.
          </p>
          {s.overlapp_m3 > 0 && (
            <p style={{ margin: '0 0 8px' }}>{nf1(s.overlapp_m3)} m³ ryms i flera av sortimenten och räknas en gång i totalen.</p>
          )}
          {d.hemved_m3 > 0 && (
            <p style={{ margin: 0 }}>Hemved {nf1(d.hemved_m3)} m³ ingår inte, den går till markägaren, aldrig till bruket.</p>
          )}
        </Stycken>
      </div>
    );
  }

  // ── Trädslag och avkap ────────────────────────────────────────────────
  if (vy === 'tradslag') {
    // Vältor och trädslag utan volym (0,0 m³) är brus och visas inte.
    const valtor = d.valtor.map(v => ({ ...v, tradslag: v.tradslag.filter(t => t.m3fub >= 0.05) })).filter(v => v.m3fub >= 0.05 && v.tradslag.length > 0);
    const ettTradslag = valtor.length === 1 && valtor[0].tradslag.length === 1 ? valtor[0].tradslag[0] : null;
    const ordrad = ettTradslag ? `medellängd ${ettTradslag.namn.toLowerCase()}, enda trädslaget`
      : valtor.length === 1 ? `medellängd hela ${valtor[0].valta.toLowerCase()}vältan`
      : 'medellängd, alla vältor';
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf2(d.medellangd_m ?? 0)} enhet="m" ordrad={ordrad}>
          <Damp>{nf1(d.total_m3fub)} m³fub · {d.avkap.st > 0 ? `${nf0(d.avkap.st)} avkap` : 'inget avkap'}</Damp>
        </Stort>
        <Rader>
          {valtor.map(v => (
            <span key={v.valta}>
              {valtor.length > 1 && (
                <Rad text={`Hela ${v.valta.toLowerCase()}vältan`} tal={`${nf2(v.medellangd_m)} m`} hoger={`${nf1(v.m3fub)} m³`} />
              )}
              {v.tradslag.map(t => (
                <Rad key={t.namn} text={t.namn} tal={`${nf2(t.medellangd_m)} m`} hoger={`${nf1(t.m3fub)} m³`} />
              ))}
            </span>
          ))}
          {d.avkap.delar.map(del => (
            <Rad key={del.kap} text={`Avkap ${del.kap}`} tal={`${nf0(del.st)} st`} hoger={`${nf2(del.m3fub)} m³`} />
          ))}
          <Rad text="Visa bitarna" href={bitarUrl} />
          <Rad text="Så räknas" onClick={() => go('rakning')} />
        </Rader>
      </div>
    );
  }

  // ── Så räknas talet ───────────────────────────────────────────────────
  if (vy === 'rakning') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stycken>
          <p style={{ margin: '0 0 8px' }}>
            Medellängden är volymvägd: summan av längd gånger volym delat med volymen. Aldrig ett snitt av
            stockarnas längder, bruket och åkeriet betalar per volym, inte per stock.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            {nf1(onskad)} m är Vidas önskade medellängd i vältan, inte ett avtalat golv. Samma tal gäller
            oavsett åtgärd och välta, bruket ser bara vältan.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            En 3 m-stock är härledd ur att biten är kortare än 3,2 m, sitter först på stammen och blev massaved.
            Maskinen har inte mätt röta.
          </p>
          {d.massa_utan_sagbar_stock_m3 > 0 && (
            <p style={{ margin: '0 0 8px' }}>
              {nf1(d.massa_utan_sagbar_stock_m3)} m³ ({nf0(d.massa_utan_sagbar_stock_st)} bitar) är korta bitar ur
              stammar som aldrig fick timmer eller kubb. De räknas inte som 3 m-stockar: utan sågbar stock finns
              inget kapbeslut att avläsa, bara ett klent träd.
            </p>
          )}
          {d.hemved_m3 > 0 && (
            <p style={{ margin: '0 0 8px' }}>Hemved {nf1(d.hemved_m3)} m³ ingår inte, den går till markägaren, aldrig till bruket.</p>
          )}
          {d.avkap.st > 0 && (
            <p style={{ margin: 0 }}>Avkap är ett eget sortiment och ligger utanför massavedsvolymen. Det påverkar alltså inte medellängden.</p>
          )}
        </Stycken>
      </div>
    );
  }

  return <div style={SIDA}><Tillbakarad href={objektUrl} text={har} /><Stycken>Den här skärmen finns inte.</Stycken></div>;
}

/** Utan ?vy= är det traktsidan (TraktVy.tsx); alla ?vy= är massavedens nivåer. */
function Val() {
  const params = useParams();
  const sp = useSearchParams();
  if (!sp.get('vy')) return <TraktVy objektId={decodeURIComponent(String(params.objektId))} />;
  return <Innehall />;
}

export default function TraktSida() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Val />
    </Suspense>
  );
}
