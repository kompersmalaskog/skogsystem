'use client';
// Objekt: slå upp en trakt när en kund undrar över mätningen. Domen för vald trakt överst, sedan tre grupper med rubriken som bär ordet
// (Under kravet / Godkända / För tunt underlag). Maskinoberoende — filtret här är objektet. Innehåll och siffror är den gamla flikens.
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import type { KalibreringVy } from '@/lib/hooks/useKalibreringVy';
import { objektDom, objektSaknarNamn } from '@/lib/kalibrering/bedomning';
import { fmtAbs1, fmtSig1 } from '@/lib/kalibrering/format';
import { OBJEKT_GRUPPER, objektRader, type ObjektRad } from '@/lib/kalibrering/objekt';
import { MATT } from '@/lib/kalibrering/ordlista';
import { Lugn, Meta, Prick } from './delar';

function ObjektDomKort({ d, valt }: { d: KalibreringData; valt: string }) {
  const data = d.objektData;
  const o = data?.objekt.find(x => x.object_name === valt);
  if (!data || !o) return null;
  const mask = o.maskin_id ? data.maskiner[o.maskin_id] : undefined;
  const dom = objektDom(o, mask);
  const tal = [`${Math.round(o.traffPct)}% inom ±4 mm`, `${MATT.systematisk.fraga} ${fmtSig1(o.systematisk)} mm`, `${MATT.standardavv.fraga} ${fmtAbs1(o.standardavv)} mm`, `n ${o.n}`].join(' · ');
  return (
    <div>
      <Svarsrad rubrik={dom.rubrik} rad={dom.tunn ? null : tal} avvikelse={dom.ton === 'hot'} />
      <Meta style={{ marginBottom: AVSTAND.m }}>{d.maskinNamnFor(o.maskin_id)}{mask?.profil ? ` · ${mask.profil}` : ''} · {o.fran} → {o.till}</Meta>
      {dom.attribution && <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.m }}>{dom.attribution}</div>}
      {dom.reservation && <Meta style={{ marginBottom: AVSTAND.m }}>{dom.reservation}</Meta>}
    </div>
  );
}

export default function ObjektFlik({ d, v }: { d: KalibreringData; v: KalibreringVy }) {
  const data = d.objektData;
  const radUt = (r: ObjektRad, sista: boolean) => {
    const saknarNamn = objektSaknarNamn(r.o.object_name);
    const tips = r.b.ingenProfil ? 'ingen kravprofil' : r.b.faMatningar ? 'få mätningar' : null;
    const under = [saknarNamn ? `registrerat som ${r.o.object_name}` : null, tips].filter(Boolean).join(' · ');
    const vald = v.valtObjekt === r.o.object_name;
    return (
      <Rad key={r.o.object_name} sista={sista} pil={false} onTryck={() => v.setValtObjekt(r.o.object_name)}
        titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>{vald && <Prick farg={FARG.text} />}<span>{saknarNamn ? 'Namn saknas' : r.o.object_name}</span></span>}
        under={under || undefined}
        hoger={r.b.grupp === 'tunt' ? `n ${r.o.n}` : `${Math.round(r.o.traffPct)}%`} hogerUnder={d.maskinKortNamnFor(r.o.maskin_id)} dampad={r.b.grupp === 'tunt'} />
    );
  };

  const { rader, soker } = data ? objektRader(data, v.objektQ) : { rader: [], soker: false };

  return (
    <>
      <Svarsrad rubrik="Objekt" rad="Slå upp en trakt när en kund undrar över mätningen." fri />
      {!data ? (
        <Lugn ikon="hourglass_empty" marginTop={0}>Laddar objekt…</Lugn>
      ) : (
        <>
          <Falt etikett="Sök objekt" value={v.objektQ} onChange={v.setObjektQ} />
          {v.valtObjekt && <ObjektDomKort d={d} valt={v.valtObjekt} />}

          {OBJEKT_GRUPPER.map(g => {
            const alla = rader.filter(r => r.b.grupp === g.key);
            if (alla.length === 0) return null;
            const nya = alla.filter(r => !r.gammal);
            const gamla = alla.filter(r => r.gammal);
            const hopfalld = g.key === 'tunt' && !v.objektVisaTunt && !soker;
            const visaAldre = soker || !!v.objektVisaAldre[g.key];
            const synliga = [...nya, ...(visaAldre ? gamla : [])];
            const visaVaxel = gamla.length > 0 && !soker;
            const rubrik = g.key === 'tunt' ? `${g.rubrik} · ${alla.length}` : `${g.rubrik} (${alla.length})`;
            return (
              <Sektion key={g.key} rubrik={rubrik} kort={!hopfalld}
                {...(g.key === 'tunt' ? { onRubrikTryck: () => v.setObjektVisaTunt(x => !x), hoger: hopfalld ? 'Visa' : 'Dölj' } : null)}>
                {!hopfalld && (
                  <>
                    {synliga.map((r, i) => radUt(r, !visaVaxel && i === synliga.length - 1))}
                    {visaVaxel && (
                      <Rad sista pil={false} onTryck={() => v.setObjektVisaAldre(x => ({ ...x, [g.key]: !x[g.key] }))}
                        titel={visaAldre ? 'Dölj äldre' : `Visa äldre (${gamla.length})`} />
                    )}
                  </>
                )}
              </Sektion>
            );
          })}
          {rader.length === 0 && <Lugn>{soker ? 'Inget objekt matchar sökningen.' : 'Inga objekt med kontrollmätningar ännu.'}</Lugn>}
        </>
      )}
    </>
  );
}
