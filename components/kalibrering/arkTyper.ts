// Vilka ark kalibreringsvyn kan öppna och vad de heter. Stapeln (lib/hooks/useArkStack) håller poster av den här typen.
//
// TVÅ SLAGS: BLADET (kontroll, stam, plan, stock, dag) är kontrollens innehåll — det ritas av KontrollPanel, som ett halvt/helt blad nerifrån på telefon
// och som en panel bredvid listan på iPad/dator; allt i bladet öppnas som push-navigering i SAMMA blad (aldrig ark ovanpå ark). Resten är vanliga ark
// (components/design/Ark): trädslag, åtgärd, ny åtgärd, hjälp.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import { dagrubrik } from '@/lib/kalibrering/datum';
import type { RutaVal } from '@/lib/kalibrering/grovlek';
import type { CalDag } from '@/lib/kalibrering/typer';

export type KalibArk =
  | { typ: 'kontroll'; data: KontrollResponse }
  | { typ: 'stam'; data: KontrollResponse; stamNummer: number }
  | { typ: 'plan'; data: KontrollResponse; stamNummer: number }
  | { typ: 'stock'; data: KontrollResponse; stockId: number }
  | { typ: 'dag'; dag: CalDag }
  | { typ: 'art'; art: string }
  | { typ: 'ruta'; ruta: RutaVal }
  | { typ: 'atgard'; id: string }
  | { typ: 'ny_atgard' }
  | { typ: 'hjalp' }
  | { typ: 'fel'; filnamn: string };

/** Poster som ritas i bladet/panelen (kontrollens innehåll). */
export const arBladPost = (a: KalibArk): boolean => a.typ === 'kontroll' || a.typ === 'stam' || a.typ === 'plan' || a.typ === 'stock' || a.typ === 'dag' || a.typ === 'fel';

export const artNamn = (art: string): string => art === 'gran' ? 'Gran' : art === 'tall' ? 'Tall' : art.charAt(0).toUpperCase() + art.slice(1);

export function arkRubrik(a: KalibArk): string {
  switch (a.typ) {
    case 'kontroll': return 'Kontroll';
    case 'stam': return `Stam ${a.stamNummer}`;
    case 'plan': return 'Där greppet släppte';
    case 'stock': return `Stock ${a.data.stockar.find(s => s.id === a.stockId)?.stock_nummer ?? ''}`.trim();
    case 'dag': return dagrubrik(a.dag.datum);
    case 'art': return artNamn(a.art);
    case 'ruta': return a.ruta.rubrik;
    case 'atgard': return 'Åtgärd';
    case 'ny_atgard': return 'Lägg till åtgärd';
    case 'hjalp': return 'Vad betyder talen?';
    case 'fel': return 'Kunde inte ladda kontroll';
  }
}
