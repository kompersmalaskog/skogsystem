// Vilka ark kalibreringsvyn kan öppna och vad de heter. Stapeln (lib/hooks/useArkStack) håller poster av den här typen; ArkVal ritar den översta
// och "‹ <föregående rubrik>" läser rubriken ur föregående post.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import { dagrubrik } from '@/lib/kalibrering/datum';
import type { CalDag, DetaljKontrollStock } from '@/lib/kalibrering/typer';

export type KalibArk =
  | { typ: 'kontroll'; data: KontrollResponse }
  | { typ: 'stam'; data: KontrollResponse; stamNummer: number }
  | { typ: 'plan'; data: KontrollResponse; stamNummer: number }
  | { typ: 'stock'; data: KontrollResponse; stockId: number }
  | { typ: 'seStock'; stock: DetaljKontrollStock }
  | { typ: 'art'; art: string }
  | { typ: 'dag'; dag: CalDag }
  | { typ: 'fel'; filnamn: string };

export const artNamn = (art: string): string => art === 'gran' ? 'Gran' : art === 'tall' ? 'Tall' : art.charAt(0).toUpperCase() + art.slice(1);

export function arkRubrik(a: KalibArk): string {
  switch (a.typ) {
    case 'kontroll': return 'Kontroll';
    case 'stam': return `Stam ${a.stamNummer}`;
    case 'plan': return 'Där greppet släppte';
    case 'stock': return `Stock ${a.data.stockar.find(s => s.id === a.stockId)?.stock_nummer ?? ''}`.trim();
    case 'seStock': return `Stock ${a.stock.stock_nummer}`;
    case 'art': return artNamn(a.art);
    case 'dag': return dagrubrik(a.dag.datum);
    case 'fel': return 'Kunde inte ladda kontroll';
  }
}
