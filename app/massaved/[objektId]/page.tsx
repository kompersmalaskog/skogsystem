'use client';

// NIVÅ 2 — ett objekt — och dess undernivåer. Samma form på varje skärm
// (form.tsx). Vilken skärm som visas styrs av ?vy= i länken, så att
// bakåtknappen och delade länkar fungerar:
//   (ingen)          objektet: medellängden stor, Vida-raden, period som
//                    kontroll, storleken, sedan raderna
//   vy=tre-m         3 m-stockar
//   vy=sagbar        sågbar dimension, ett sortiment per rad
//   vy=sortiment     ett sortiment: fönstret, en nivå till in (&sort=namn)
//   vy=sagbar-rakning
//   vy=langd         längdfördelning
//   vy=tradslag      trädslag och avkap — avkapets 3 dm och 6 dm bor här
//   vy=rakning       så räknas talet
//
// Omfånget: ?manad=YYYY-MM är månaden, saknas den eller är "alla" gäller
// hela objektet. Månaden ärvs från raden man tryckte på i nivå 1, så första
// talet man ser är det man kom från.
//
// BEGREPPEN:
//   3 m-stock  massavedsstock kapad till 3 m för att ta bort röta. INUTI
//              massavedsvolymen; det är den som drar ner medellängden.
//   Avkap      kapposten ur prislistan, 3 dm eller 6 dm. Eget sortiment,
//              UTANFÖR massavedsvolymen.
//   Sågbar     biten ryms i ett helt sortimentsfönster — längd OCH diameter.
//   dimension  Fönstren kommer ur objektets EGNA sortiment.
//
// Rör inga beräkningar: allt här är omflyttning av det som redan hämtas.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, GUL, GRON, SEKUNDAR, MUTED, nf0, nf1, nf2, manadNamn, manadEtikett, stor, utanPrefix,
         Rubrikrad, Tillbakarad, Stort, Tillstand, Damp, Kontroll, Mening, Rad, Rader, Textlank, Stycken, Laddar, Fel } from '../form';

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
type ObjektIManad = { objekt_id: string; namn: string | null };
type Rotkap = { stammar: number; grupp2_stammar: number };

/** "Timmer: Vislanda_195_1-2_V3" → "Timmer Vislanda". Maskinens namn står kvar en nivå in. */
function kortNamn(so: SagbartSortiment) {
  const bas = so.namn.replace(/^[^:]+:\s*/, '').split('_')[0];
  return `${so.grupp} ${bas}`;
}

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
  const [andra, setAndra] = useState<ObjektIManad[]>([]);

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

  // Väljaren i rubrikraden: månadens övriga objekt, båda vältorna.
  const pickerManad = manad ?? (d?.manader?.length ? d.manader[d.manader.length - 1] : null);
  useEffect(() => {
    if (!pickerManad) return;
    Promise.all(['Barr', 'Björk'].map(v => supabase.rpc('massaved_niva1', { p_manad: `${pickerManad}-01`, p_valta: v })))
      .then(res => {
        const sedda = new Set<string>(); const ut: ObjektIManad[] = [];
        for (const r of res) {
          const lista = (r.data as { objekt?: ObjektIManad[]; utan_bolag?: ObjektIManad[] } | null);
          for (const o of [...(lista?.objekt ?? []), ...(lista?.utan_bolag ?? [])]) {
            if (!sedda.has(o.objekt_id)) { sedda.add(o.objekt_id); ut.push(o); }
          }
        }
        setAndra(ut);
      })
      .catch(() => setAndra([]));
  }, [pickerManad]);

  const namn = utanPrefix(d?.namn ?? objektId);
  const periodOrd = manad ? manadNamn(manad) : 'hela objektet';
  const bas = `/massaved/${encodeURIComponent(objektId)}`;
  const url = (q: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    p.set('manad', manad ?? 'alla');
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return `${bas}?${p.toString()}`;
  };
  const go = (v: string, s?: string) => router.push(url({ vy: v, sort: s }));
  const objektUrl = url({});
  const rotkapUrl = `/rotkap?objekt=${encodeURIComponent(objektId)}`;
  const har = `${namn} · ${periodOrd}`;

  if (laddar) return <div style={SIDA}><Laddar vad={namn} /></div>;
  if (fel) return <div style={SIDA}><Fel rubrik="Objektet kunde inte hämtas" fel={fel} igen={hamta} /></div>;
  if (!d) return <div style={SIDA} />;

  const onskad = d.onskad_medellangd_m;
  const bitar = d.langdfordelning.reduce((s, k) => s + k.st, 0);
  const overMal = d.langdfordelning.filter(k => k.niva === 'over_mal').reduce((s, k) => s + k.andel, 0);
  const valtaOrd = d.valtor.length === 1 ? `${d.valtor[0].valta.toLowerCase()}massaved` : 'massaved';
  const under = d.medellangd_m != null && d.medellangd_m < onskad;

  // ── Objektet ──────────────────────────────────────────────────────────
  if (!vy) {
    return (
      <div style={SIDA}>
        <Rubrikrad text={namn} value={objektId} label="Objekt"
          onChange={id => id === '__alla'
            ? router.push(`/massaved?manad=${pickerManad ?? ''}`)
            : router.push(`/massaved/${encodeURIComponent(id)}?manad=${manad ?? 'alla'}`)}>
          <option value="__alla">Alla objekt{pickerManad ? ` i ${manadEtikett(pickerManad)}` : ''}</option>
          <option value={objektId}>{namn}</option>
          {andra.filter(o => o.objekt_id !== objektId).map(o => (
            <option key={o.objekt_id} value={o.objekt_id}>{utanPrefix(o.namn ?? o.objekt_id)}</option>
          ))}
        </Rubrikrad>

        {d.medellangd_m == null ? (
          <div style={{ padding: '18px 16px 0', fontSize: 13, lineHeight: 1.6 }}>
            Ingen massaved på {namn}{manad ? ` i ${manadEtikett(manad)}` : ''}.
            {d.manader.length > 0 && manad && (
              <Kontroll text={periodOrd} value={manad} label="Period"
                onChange={m => router.replace(`${bas}?manad=${m}`, { scroll: false })}>
                {d.manader.map(m => <option key={m} value={m}>{stor(manadEtikett(m))}</option>)}
                <option value="alla">Hela objektet</option>
              </Kontroll>
            )}
          </div>
        ) : (
          <>
            <Stort tal={nf2(d.medellangd_m)} enhet="m" ordrad={`medellängd ${valtaOrd}`}>
              <Tillstand farg={under ? GUL : GRON}>{under ? 'under' : 'når'} Vidas önskade {nf1(onskad)} m</Tillstand>
              <Kontroll text={periodOrd} value={manad ?? 'alla'} label="Period"
                onChange={m => router.replace(`${bas}?manad=${m}`, { scroll: false })}>
                {d.manader.map(m => <option key={m} value={m}>{stor(manadEtikett(m))}</option>)}
                <option value="alla">Hela objektet</option>
              </Kontroll>
              <Damp>{nf1(d.total_m3fub)} m³fub · {nf0(bitar)} bitar</Damp>
            </Stort>

            <Rader>
              {d.tre_m_stock.st > 0 && (
                <Rad text="3 m-stockar" tal={nf1(d.tre_m_stock.andel ?? 0)} enhet="%" onClick={() => go('tre-m')} />
              )}
              {d.sagbar.sortiment.length > 0 && (
                <Rad text="Sågbar dimension" tal={nf1(d.sagbar.andel ?? 0)} enhet="%" onClick={() => go('sagbar')} />
              )}
              <Rad text="Längdfördelning" tal={nf0(overMal)} enhet="%" onClick={() => go('langd')} />
              <Rad text="Trädslag och avkap" onClick={() => go('tradslag')} />
              <Rad text="Så räknas talet" onClick={() => go('rakning')} />
            </Rader>
            <Textlank href={rotkapUrl} text="Vad kostar ett längre rotkap" />
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
        <Stort tal={nf1(t.andel ?? 0)} enhet="%" ordrad="av massaveden är 3 m-stockar">
          <Damp>{nf0(t.st)} st · {nf1(t.m3fub)} m³fub</Damp>
          <Mening>Kapade till 3 m för att ta bort röta. De ligger i massavedsvolymen och drar ner medellängden.</Mening>
        </Stort>
        <Rader>
          {t.medellangd_utan_m3 != null && <Rad text="Utan dem" tal={nf2(t.medellangd_utan_m3)} enhet="m" farg={GRON} />}
          {rotkap && rotkap.grupp2_stammar > 0 && (
            <Rad text="Rötan fortsatte" tal={nf0(rotkap.grupp2_stammar)} enhet="stammar" href={rotkapUrl} />
          )}
          <Rad text="Visa bitarna" href={`${bas}/bitar`} />
        </Rader>
        <Textlank href={rotkapUrl} text="Vad kostar ett längre rotkap" />
      </div>
    );
  }

  // ── Sågbar dimension ──────────────────────────────────────────────────
  if (vy === 'sagbar') {
    const s = d.sagbar;
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf1(s.andel ?? 0)} enhet="%" ordrad="av massaveden ryms i ett sågbart sortiment">
          <Damp>{nf1(s.m3fub)} m³fub · {s.sortiment.length} sortiment</Damp>
          <Mening>Både längd och diameter måste rymmas i sortimentets fönster, som biten redan är kapad.</Mening>
        </Stort>
        <Rader>
          {s.sortiment.map(so => (
            <Rad key={so.namn} text={kortNamn(so)} tal={nf1(so.m3fub)} enhet="m³" onClick={() => go('sortiment', so.namn)} />
          ))}
          <Rad text="Så räknas sågbart" onClick={() => go('sagbar-rakning')} />
        </Rader>
      </div>
    );
  }

  // ── Ett sortiment: fönstret ───────────────────────────────────────────
  if (vy === 'sortiment') {
    const so = d.sagbar.sortiment.find(x => x.namn === sort);
    const sagbarUrl = url({ vy: 'sagbar' });
    if (!so) return <div style={SIDA}><Tillbakarad href={sagbarUrl} text="Sågbar dimension" /><Stycken>Sortimentet finns inte i det här omfånget.</Stycken></div>;
    const urMaskinen = so.kalla === 'hpr' && so.langd_max_m != null;
    return (
      <div style={SIDA}>
        <Tillbakarad href={sagbarUrl} text="Sågbar dimension" />
        <Stort tal={nf1(so.m3fub)} enhet="m³fub" ordrad={`sågbar dimension, ${kortNamn(so)}`}>
          <Damp>
            {urMaskinen
              ? <>{nf2(so.langd_min_m)}–{nf2(so.langd_max_m as number)} m · {nf0(so.dia_min_mm)}–{nf0(so.dia_max_mm)} mm · ur maskinen</>
              : <>från {nf2(so.langd_min_m)} m · {nf0(so.dia_min_mm)}–{nf0(so.dia_max_mm)} mm · taket härlett</>}
          </Damp>
          {!urMaskinen && (
            <Mening>De undre gränserna står i prislistan, de övre är härledda ur högsta prisklassen. Maskinens fil bär de riktiga gränserna när den lästs in.</Mening>
          )}
          <Mening>I maskinen heter sortimentet {so.namn}.</Mening>
        </Stort>
      </div>
    );
  }

  // ── Så räknas sågbart ─────────────────────────────────────────────────
  if (vy === 'sagbar-rakning') {
    const s = d.sagbar;
    return (
      <div style={SIDA}>
        <Tillbakarad href={url({ vy: 'sagbar' })} text="Sågbar dimension" />
        <Stycken>
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

  // ── Längdfördelning ───────────────────────────────────────────────────
  if (vy === 'langd') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf0(overMal)} enhet="%" ordrad={`av volymen är ${nf1(onskad)} m eller längre`}>
          <Damp>{nf0(bitar)} bitar · {nf1(d.total_m3fub)} m³fub</Damp>
        </Stort>
        <Rader>
          {d.langdfordelning.map(k => (
            <Rad key={k.klass} text={k.klass} tal={nf1(k.andel)} enhet="%"
              sub={<>{nf1(k.m3fub)} m³ · {nf0(k.st)} st{k.varav_tre_m_st > 0 && <>, varav {nf0(k.varav_tre_m_st)} 3 m-stockar</>}</>} />
          ))}
        </Rader>
      </div>
    );
  }

  // ── Trädslag och avkap ────────────────────────────────────────────────
  if (vy === 'tradslag') {
    const ettTradslag = d.valtor.length === 1 && d.valtor[0].tradslag.length === 1 ? d.valtor[0].tradslag[0] : null;
    const ordrad = ettTradslag ? `medellängd ${ettTradslag.namn.toLowerCase()}, enda trädslaget`
      : d.valtor.length === 1 ? `medellängd hela ${d.valtor[0].valta.toLowerCase()}vältan`
      : 'medellängd, alla vältor';
    return (
      <div style={SIDA}>
        <Tillbakarad href={objektUrl} text={har} />
        <Stort tal={nf2(d.medellangd_m ?? 0)} enhet="m" ordrad={ordrad}>
          <Damp>{nf1(d.total_m3fub)} m³fub · {d.avkap.st > 0 ? `${nf0(d.avkap.st)} avkap` : 'inget avkap'}</Damp>
          {d.avkap.st > 0 && <Mening>Avkap är ett eget sortiment utanför massavedsvolymen och påverkar inte medellängden.</Mening>}
        </Stort>
        <Rader>
          {d.valtor.map(v => (
            <span key={v.valta}>
              {d.valtor.length > 1 && (
                <Rad text={`Hela ${v.valta.toLowerCase()}vältan`} tal={nf2(v.medellangd_m)} enhet="m" sub={`${nf1(v.m3fub)} m³`} />
              )}
              {v.tradslag.map(t => (
                <Rad key={t.namn} text={t.namn} tal={nf2(t.medellangd_m)} enhet="m"
                  sub={<>{nf1(t.m3fub)} m³{t.sagbar_m3 > 0 && <> · sågbar dimension {nf1(t.sagbar_m3)} m³</>}</>} />
              ))}
            </span>
          ))}
          {d.avkap.delar.map(del => (
            <Rad key={del.kap} text={`Avkap ${del.kap}`} tal={nf0(del.st)} enhet="st" sub={`${nf2(del.m3fub)} m³`} />
          ))}
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

export default function MassavedObjekt() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
