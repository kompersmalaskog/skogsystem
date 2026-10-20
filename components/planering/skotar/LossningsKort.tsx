'use client';

// Kortet nederst över kartan när skotaren lossar vid ett avlägg. Täcker så lite karta som möjligt (en smal list, plats kvar åt plus-knappen).
//   lossar      "Lossar → Avlägg 01-1" med löpande tid. Står kvar tills maskinen lämnat avlägget — ingen timer, det försvinner inte medan han lossar.
//   klar        "✓ Lass 7 lossat → Avlägg 01-1" + sortimenten + Ändra: lossningen tog slut och lasset bekräftade sig självt (stilla ≥ 5 min). Står en kort stund.
//   kontroll    lossningen tog slut men lasset bekräftar sig inte självt (kort lossning): Stämmer / Ändra / ✕. Står kvar tills föraren svarat.
//   forare      lasset måste fyllas i (första lasset, del 2, tomt) → en stor knapp "Fyll i".
//   avlagg_val  två avlägg ligger nära varandra → stora knappar med de möjliga avläggen.
// Samma plats används av frågan "Nytt avlägg här?".

import React, { useEffect, useState } from 'react';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { serverNu } from '@/lib/serverKlocka';
import { lassSortimentText, lassTitel } from '@/lib/skotarLass/lassModell';
import { avlaggRubrik } from '@/lib/skotarLass/avlagg';
import type { Avlagg, Lass } from '@/lib/skotarLass/typer';
import type { LossningsKort as KortState, NyttAvlaggFraga } from '@/lib/hooks/useSkotarLass';
import { knappPrimar, knappStor, meta, nertillKort, TRYCK_PX } from './stil';

/** "4:12" — hur länge lossningen pågått (från att maskinen stannade). Räknar varje sekund; lasset sparas aldrig med den här texten. */
export const lossarTid = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Tid({ start }: { start: number }) {
  const [nu, setNu] = useState(() => serverNu());
  useEffect(() => {
    setNu(serverNu());
    const iv = window.setInterval(() => setNu(serverNu()), 1000);
    return () => window.clearInterval(iv);
  }, [start]);
  return <span data-testid="lossning-tid" style={{ ...TYP.tal, ...TNUM, lineHeight: 1 }}>{lossarTid(nu - start)}</span>;
}

const NerKnapp = ({ onClick, etikett, testid }: { onClick: () => void; etikett: string; testid: string }) => (
  <button type="button" aria-label={etikett} data-testid={testid} onClick={onClick}
    style={{ ...knappStor, flexShrink: 0, minWidth: TRYCK_PX, padding: 0, color: FARG.text2 }}>✕</button>
);

export function LossningsKort({ kort, lass, avlagg, onAndra, onFyllI, onStammer, onValjAvlagg, onTaBort }: {
  kort: KortState;
  lass: Lass;
  avlagg: readonly Avlagg[];
  onAndra: () => void;
  onFyllI: () => void;
  onStammer: () => void;
  onValjAvlagg: (a: Avlagg) => void;
  onTaBort: () => void;
}) {
  const del = lass.delar.find((d) => d.delNr === kort.delNr) ?? lass.delar[lass.delar.length - 1];
  const titel = lassTitel(lass, del.delNr);
  const avl = avlaggRubrik({ nummer: del.avlaggNummer ?? '' });
  const kandidater = avlagg
    .filter((a) => Math.hypot((a.lat - del.lat) * 111320, (a.lng - del.lng) * 111320 * Math.cos((del.lat * Math.PI) / 180)) <= 90)
    .sort((a, b) => Math.hypot(a.lat - del.lat, a.lng - del.lng) - Math.hypot(b.lat - del.lat, b.lng - del.lng))
    .slice(0, 4);
  const rad = { padding: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.m } as const;

  return (
    <div data-testid="lossningskort" data-nertill-kort="" data-fas={kort.fas} role="status" aria-live="polite" style={nertillKort}>
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
      ) : kort.fas === 'lossar' ? (
        <div style={rad}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...TYP.listtitel }}>Lossar → {avl}</div>
            <div style={meta}>{titel}</div>
          </div>
          <Tid start={kort.start} />
          <button type="button" data-testid="lossning-andra" onClick={onAndra} style={{ ...knappStor, flexShrink: 0 }}>Ändra</button>
          <NerKnapp onClick={onTaBort} etikett="Det var ingen lossning — ta bort" testid="lossning-ta-bort" />
        </div>
      ) : kort.fas === 'kontroll' ? (
        <div style={rad}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...TYP.listtitel }}>{titel} lossat → {avl}</div>
            <div style={{ ...meta, color: FARG.text, ...TNUM }}>{del.rader.length ? lassSortimentText(del.rader) : ''}</div>
          </div>
          <button type="button" data-testid="lossning-stammer" onClick={onStammer} style={{ ...knappPrimar, flexShrink: 0 }}>Stämmer</button>
          <button type="button" data-testid="lossning-andra" onClick={onAndra} style={{ ...knappStor, flexShrink: 0 }}>Ändra</button>
          <NerKnapp onClick={onTaBort} etikett="Det var ingen lossning — ta bort" testid="lossning-ta-bort" />
        </div>
      ) : kort.fas === 'forare' ? (
        <div style={rad}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...TYP.listtitel }}>{titel} lossat → {avl}</div>
            <div style={meta}>{lass.delar.length > 1 && del.delNr > 1 ? 'Samma last — fyll i hur den delades' : 'Fyll i vad som lastades'}</div>
          </div>
          <button type="button" data-testid="lossning-fyll-i" onClick={onFyllI} style={{ ...knappPrimar, flexShrink: 0 }}>Fyll i</button>
          <NerKnapp onClick={onTaBort} etikett="Det var ingen lossning — ta bort" testid="lossning-ta-bort" />
        </div>
      ) : (
        <div style={rad}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...TYP.listtitel }}><span style={{ color: FARG.gron }} aria-hidden="true">✓ </span>{titel} lossat → {avl}</div>
            <div style={{ ...meta, color: FARG.text, ...TNUM }}>{del.rader.length ? lassSortimentText(del.rader) : ''}</div>
          </div>
          <button type="button" data-testid="lossning-andra" onClick={onAndra} style={{ ...knappStor, flexShrink: 0 }}>Ändra</button>
        </div>
      )}
    </div>
  );
}

export function NyttAvlaggKort({ fraga, nummer, onSvar }: { fraga: NyttAvlaggFraga; nummer: string; onSvar: (ja: boolean) => void }) {
  return (
    <div data-testid="nytt-avlagg-kort" data-nertill-kort="" data-ts={fraga.ts} role="alertdialog" aria-label="Nytt avlägg här?" style={nertillKort}>
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
