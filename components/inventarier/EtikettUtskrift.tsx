'use client';

// Det som skrivs ut: etiketter i FYSISKA mått på A4 — inget som visas på skärmen.
//
// Arket är det vanliga 3 × 7-arket med 70 × 42,3 mm etiketter utan marginal (t.ex. Avery 3652). Måtten är papprets och
// skrivs därför i millimeter och punkter här, inte ur lib/design/tokens (som är skärmens skala). Filen ligger med flit
// utanför design-lintens SKARPA-lista.
//
// Varje etikett: QR-koden (32 mm, vilket kameran läser på en armslängds avstånd), namnet, platsen och vad en skanning
// gör ("RESERVLÅDA · skanna när du börjar på den"). Svart på vitt — det är papper.
//
// På skärmen syns den inte alls; vid utskrift syns BARA den (CSS nedan).

import type { EtikettText } from '@/lib/inventarier/qr';

export type UtskriftEtikett = { id: string; svg: string; text: EtikettText };

const CSS = `
.etikett-utskrift { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  body * { visibility: hidden !important; }
  .etikett-utskrift, .etikett-utskrift * { visibility: visible !important; }
  .etikett-utskrift { display: grid !important; position: absolute; left: 0; top: 0; width: 210mm;
    grid-template-columns: repeat(3, 70mm); grid-auto-rows: 42.3mm; background: #fff; }
  .etikett { box-sizing: border-box; padding: 3mm; display: flex; gap: 2.5mm; align-items: center;
    break-inside: avoid; overflow: hidden; color: #000; font-family: -apple-system, system-ui, sans-serif; }
  .etikett-qr { flex: 0 0 32mm; width: 32mm; height: 32mm; }
  .etikett-qr svg { width: 100%; height: 100%; display: block; }
  .etikett-text { min-width: 0; display: flex; flex-direction: column; gap: 1.2mm; }
  .etikett-titel { font-size: 10pt; font-weight: 700; line-height: 1.15; }
  .etikett-plats { font-size: 7.5pt; line-height: 1.2; }
  .etikett-gor { font-size: 6.5pt; font-weight: 600; line-height: 1.2; }
}
`;

export default function EtikettUtskrift({ etiketter }: { etiketter: UtskriftEtikett[] }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="etikett-utskrift" aria-hidden="true" data-testid="etikett-utskrift">
        {etiketter.map(e => (
          <div key={e.id} className="etikett" data-etikett={e.id}>
            <div className="etikett-qr" dangerouslySetInnerHTML={{ __html: e.svg }} />
            <div className="etikett-text">
              <div className="etikett-titel">{e.text.titel}</div>
              <div className="etikett-plats">{e.text.plats}</div>
              <div className="etikett-gor">{e.text.gor}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
