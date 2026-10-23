'use client';
// Redigeringens objektlista under "Behöver dig" (Martin 2026-10-23: per månad, per gallring/slutavverkning, som skissen).
// Hitta ett objekt (sök + typ) · Pågår · Skotning kvar · senaste månaden öppen · Tidigare (en rad per månad, fälls ut på
// plats) · Matchning och Exkluderade sist. All text ur lib/redigering/listaVy.ts.

import { useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import Flikkontroll from '@/components/design/Flikkontroll';
import { byggLista, matcharSok, type ListGrupp, type ListRad, type TypFilter } from '@/lib/redigering/listaVy';

export interface ObjektListaProps {
  grupper: ListGrupp[];
  exkluderade: ListGrupp[];
  onOppna: (nyckel: string) => void;
  onMatchning: () => void;
  /** Maskinobjekt utan planering (matchningens första tal); null medan det läses eller när det inte gick. */
  matchningUtan: number | null;
}

export default function ObjektLista({ grupper, exkluderade, onOppna, onMatchning, matchningUtan }: ObjektListaProps) {
  const [typ, setTyp] = useState<TypFilter>('alla');
  const [sok, setSok] = useState('');
  const [oppna, setOppna] = useState<Set<string>>(new Set());
  const [visaExkl, setVisaExkl] = useState(false);
  const lista = useMemo(() => byggLista(grupper, { typ, sok }), [grupper, typ, sok]);
  const soker = sok.trim() !== '';

  const flikar = ([
    ['alla', 'Alla'], ['Slutavverkning', 'Slutavverkning'], ['Gallring', 'Gallring'], ['Grot', 'GROT'],
  ] as const).filter(([id]) => id === 'alla' || lista.antal[id] > 0 || typ === id);

  const vaxla = (n: string) => setOppna(s => { const ny = new Set(s); if (ny.has(n)) ny.delete(n); else ny.add(n); return ny; });
  const rader = (r: ListRad[]) => r.map((x, i) => <ObjRad key={x.nyckel} rad={x} sista={i === r.length - 1} onTryck={() => onOppna(x.nyckel)} />);

  // Senaste månaden står öppen; äldre månader är en rad var som fälls ut. Söker man står alla öppna.
  const [forsta, ...aldre] = lista.manader;
  const exklSynliga = exkluderade.filter(g => matcharSok(g, sok));

  return (
    <div data-objekt-lista="">
      <h3 style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>Hitta ett objekt</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: FARG.kort, borderRadius: RADIE.kort, marginBottom: AVSTAND.s }}>
        <Ikon namn="search" storlek={IKON.text} farg={FARG.text3} />
        <input value={sok} onChange={e => setSok(e.target.value)} placeholder="Namn, VO, bolag eller markägare" aria-label="Sök objekt" data-sok=""
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: FARG.text, ...TYP.text, fontFamily: 'inherit' }} />
        {soker && (
          <button type="button" onClick={() => setSok('')} aria-label="Rensa sökningen"
            style={{ minWidth: TRAFFYTA.min, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Ikon namn="cancel" storlek={IKON.text} farg={FARG.text3} fylld />
          </button>
        )}
      </label>
      {flikar.length > 2 && <div style={{ marginBottom: AVSTAND.xl }}><Flikkontroll flikar={flikar} aktiv={typ} onVal={setTyp} /></div>}

      {lista.traffar === 0 && (
        <p style={{ margin: `0 0 ${AVSTAND.xl}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.text2 }} data-inga-traffar="">
          {soker ? `Inget objekt matchar "${sok.trim()}".` : 'Inga objekt.'}
        </p>
      )}

      {lista.pagar.length > 0 && <Sektion rubrik="Pågår" inset>{rader(lista.pagar)}</Sektion>}
      {lista.skotningKvar.length > 0 && <Sektion rubrik="Skotning kvar" inset>{rader(lista.skotningKvar)}</Sektion>}

      {forsta && <Sektion rubrik={forsta.rubrik} inset>{rader(forsta.rader)}</Sektion>}
      {aldre.length > 0 && (soker
        ? aldre.map(m => <Sektion key={m.nyckel} rubrik={m.rubrik} inset>{rader(m.rader)}</Sektion>)
        : (
          <Sektion rubrik="Tidigare" inset>
            {aldre.map((m, i) => {
              const ar = oppna.has(m.nyckel);
              const sista = i === aldre.length - 1;
              return (
                <div key={m.nyckel} data-manad={m.nyckel}>
                  <Rad titel={m.rubrik} pil={false} sista={sista && !ar} onTryck={() => vaxla(m.nyckel)}
                    attr={{ 'aria-expanded': String(ar) }}
                    hoger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, fontWeight: 400, color: FARG.text2 }}>
                      {m.rader.length}
                      <Ikon namn={ar ? 'expand_less' : 'expand_more'} storlek={IKON.text} farg={FARG.text3} />
                    </span>} />
                  {ar && <div style={{ paddingLeft: AVSTAND.l }}>{rader(m.rader)}</div>}
                </div>
              );
            })}
          </Sektion>
        ))}

      {lista.utanDatum.length > 0 && (
        <Sektion rubrik="Klart utan datum" inset not="Klart enligt reglerna men inget avslutsdatum satt. Öppna och sätt datum under Är det klart?">
          {rader(lista.utanDatum)}
        </Sektion>
      )}

      <Sektion rubrik="Övrigt" inset>
        <Rad titel="Matchning" under="Maskinobjekt mot planerade objekt" onTryck={onMatchning}
          hoger={matchningUtan != null && matchningUtan > 0 ? <span style={{ fontWeight: 400, color: FARG.orange }}>{matchningUtan} utan planering</span> : undefined}
          sista={exklSynliga.length === 0} />
        {exklSynliga.length > 0 && (
          <Rad titel="Exkluderade" under="Döljs i statistiken" pil={false} sista={!visaExkl} onTryck={() => setVisaExkl(v => !v)}
            attr={{ 'aria-expanded': String(visaExkl), 'data-exkluderade': '' }}
            hoger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, fontWeight: 400, color: FARG.text2 }}>
              {exklSynliga.length}
              <Ikon namn={visaExkl ? 'expand_less' : 'expand_more'} storlek={IKON.text} farg={FARG.text3} />
            </span>} />
        )}
        {visaExkl && exklSynliga.map((g, i) => (
          <div key={g.nyckel} style={{ paddingLeft: AVSTAND.l }}>
            <Rad titel={(g.namn ?? '').trim() || (g.vo ? `VO ${g.vo}` : 'Namnlöst objekt')} under={g.vo ? `VO ${g.vo}` : undefined} dampad
              sista={i === exklSynliga.length - 1} onTryck={() => onOppna(g.nyckel)} />
          </div>
        ))}
      </Sektion>
    </div>
  );
}

function ObjRad({ rad, sista, onTryck }: { rad: ListRad; sista: boolean; onTryck: () => void }) {
  return (
    <Rad sista={sista} onTryck={onTryck} attr={{ 'data-rad': rad.nyckel }}
      titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, minWidth: 0 }}>
        {rad.forslag && <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.orange, flexShrink: 0 }} />}
        <span style={{ minWidth: 0 }}>{rad.namn}</span>
        {rad.special && <span data-special="" style={{ ...TYP.micro, color: FARG.text2, background: FARG.upphojt, borderRadius: RADIE.rad, padding: `${AVSTAND.xs / 2}px ${AVSTAND.xs}px`, flexShrink: 0 }}>Special</span>}
      </span>}
      under={rad.under}
      hoger={rad.hoger ? <span style={{ fontWeight: 400, color: FARG.text2 }}>{rad.hoger}</span> : undefined} />
  );
}
