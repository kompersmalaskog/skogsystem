'use client';
// "PEFC – vad gäller?": kraven för traktens certifiering, en rad per krav i vanliga ord med källan under (lib/certKrav). Ett okontrollerat krav står orange.
import React from 'react';
import { AVSTAND, FARG, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { CERT_INFO, type CertTyp } from '@/lib/certKrav';
import { Gruppkort, Huvud, Rubrik } from './infoDelar';

export default function CertInfoVy({ typer, objektNamn, onTillbaka, onStang }: { typer: CertTyp[]; objektNamn: string; onTillbaka: () => void; onStang: () => void }) {
  return (
    <>
      <Huvud titel={`${typer.join(' och ')} – vad gäller?`} undertitel="Vid föryngringsavverkning" tillbaka={objektNamn} onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="cert-info" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        {typer.map((t) => {
          const info = CERT_INFO[t];
          return (
            <section key={t} data-testid={`cert-info-${t}`}>
              {typer.length > 1 && <Rubrik>{info.namn}</Rubrik>}
              <Gruppkort>
                {info.krav.map((k, i) => (
                  <div key={k.rubrik} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                    <div style={{ ...TYP.listtitel, color: k.kontrollera ? FARG.orange : FARG.text }}>{k.rubrik}</div>
                    <div style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.xs }}>{k.text}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{k.kalla}</div>
                  </div>
                ))}
              </Gruppkort>
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, marginTop: AVSTAND.s }}>
                {info.lankar.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ ...TYP.meta, color: FARG.bla, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }}>{l.text} ›</a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
