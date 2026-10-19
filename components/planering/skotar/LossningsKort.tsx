'use client';

// Kortet som glider upp nederst när skotaren lossat vid ett avlägg. Täcker så lite karta som möjligt (en smal list, plats kvar åt plus-knappen).
//   auto        "✓ Lass 7 lossat → Avlägg 2" + sortimenten + Ändra. Den tunna linjen fylls på 10 s, sedan är lasset bekräftat och kortet borta.
//   forare      lasset kan inte bekräfta sig självt (första lasset, del 2, tomt) → en stor knapp "Fyll i".
//   avlagg_val  två avlägg ligger nära varandra → stora knappar med de möjliga avläggen.
// Samma plats används av frågan "Nytt avlägg här?".

import React from 'react';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { AUTO_BEKRAFTA_MS, lassRad, lassTitel } from '@/lib/skotarLass/lassModell';
import { sortimentVisning } from '@/lib/skotarLass/sortiment';
import { avlaggRubrik } from '@/lib/skotarLass/avlagg';
import type { Avlagg, Lass } from '@/lib/skotarLass/typer';
import type { LossningsKort as KortState, NyttAvlaggFraga } from '@/lib/hooks/useSkotarLass';
import { knappPrimar, knappStor, meta, nertillKort, TRYCK_PX } from './stil';

export function LossningsKort({ kort, lass, avlagg, onAndra, onFyllI, onValjAvlagg, onTaBort }: {
  kort: KortState;
  lass: Lass;
  avlagg: readonly Avlagg[];
  onAndra: () => void;
  onFyllI: () => void;
  onValjAvlagg: (a: Avlagg) => void;
  onTaBort: () => void;
}) {
  const del = lass.delar.find((d) => d.delNr === kort.delNr) ?? lass.delar[lass.delar.length - 1];
  const titel = lassTitel(lass, del.delNr);
  const kandidater = avlagg
    .filter((a) => Math.hypot((a.lat - del.lat) * 111320, (a.lng - del.lng) * 111320 * Math.cos((del.lat * Math.PI) / 180)) <= 90)
    .sort((a, b) => Math.hypot(a.lat - del.lat, a.lng - del.lng) - Math.hypot(b.lat - del.lat, b.lng - del.lng))
    .slice(0, 4);

  return (
    <div data-testid="lossningskort" data-fas={kort.fas} role="status" aria-live="polite" style={nertillKort}>
      {kort.fas === 'avlagg_val' ? (
        <div style={{ padding: AVSTAND.l }}>
          <div style={{ ...TYP.listtitel }}>{titel} lossat — vilket avlägg?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
            {kandidater.map((a) => (
              <button key={a.id} type="button" data-testid={`avlagg-val-${a.nummer}`} onClick={() => onValjAvlagg(a)} style={{ ...knappPrimar, flex: '1 1 120px' }}>
                {avlaggRubrik(a)}
              </button>
            ))}
          </div>
        </div>
      ) : kort.fas === 'forare' ? (
        <div style={{ padding: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...TYP.listtitel }}>{titel} lossat → {avlaggRubrik({ nummer: del.avlaggNummer ?? '' })}</div>
            <div style={meta}>{lass.delar.length > 1 && del.delNr > 1 ? 'Samma last — fyll i hur den delades' : 'Fyll i vad som lastades'}</div>
          </div>
          <button type="button" data-testid="lossning-fyll-i" onClick={onFyllI} style={{ ...knappPrimar, flexShrink: 0 }}>Fyll i</button>
          <button type="button" aria-label="Det var ingen lossning — ta bort" data-testid="lossning-ta-bort" onClick={onTaBort}
            style={{ ...knappStor, flexShrink: 0, minWidth: TRYCK_PX, padding: 0, color: FARG.text2 }}>✕</button>
        </div>
      ) : (
        <>
          <div style={{ padding: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...TYP.listtitel }}><span style={{ color: FARG.gron }} aria-hidden="true">✓ </span>{titel} lossat → {avlaggRubrik({ nummer: del.avlaggNummer ?? '' })}</div>
              <div style={{ ...meta, color: FARG.text, ...TNUM }}>
                {del.rader.length ? lassRad({ avlaggNummer: null, rader: del.rader }, sortimentVisning).replace(/^Inget avlägg valt · /, '') : ''}
              </div>
            </div>
            <button type="button" data-testid="lossning-andra" onClick={onAndra} style={{ ...knappStor, flexShrink: 0 }}>Ändra</button>
          </div>
          <div aria-hidden="true" style={{ height: 3, background: FARG.linje }}>
            <div key={`${kort.lassId}-${kort.start}`} data-testid="lossning-linje" style={{ height: 3, background: FARG.gron, animation: `skotarLinje ${AUTO_BEKRAFTA_MS}ms linear forwards` }} />
          </div>
          <style>{`@keyframes skotarLinje { from { width: 0%; } to { width: 100%; } }`}</style>
        </>
      )}
    </div>
  );
}

export function NyttAvlaggKort({ fraga, nummer, onSvar }: { fraga: NyttAvlaggFraga; nummer: string; onSvar: (ja: boolean) => void }) {
  return (
    <div data-testid="nytt-avlagg-kort" data-ts={fraga.ts} role="alertdialog" aria-label="Nytt avlägg här?" style={nertillKort}>
      <div style={{ padding: AVSTAND.l }}>
        <div style={{ ...TYP.listtitel }}>Nytt avlägg här?</div>
        <div style={meta}>Du står stilla en bit från alla avlägg. Det blir Avlägg {nummer}.</div>
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
          <button type="button" data-testid="nytt-avlagg-ja" onClick={() => onSvar(true)} style={{ ...knappPrimar, flex: 1 }}>Ja, nytt avlägg</button>
          <button type="button" data-testid="nytt-avlagg-nej" onClick={() => onSvar(false)} style={{ ...knappStor, flex: 1 }}>Nej</button>
        </div>
      </div>
    </div>
  );
}
