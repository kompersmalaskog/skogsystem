/**
 * Länken ur en push-notis pekar på EN ansökan, och vyn ska landa PÅ den (scrolla dit och markera den en stund):
 *   /ledighet?besked=<id>   beslutsnotisen (godkänd/nekad) → den egna ansökan, överst under "Nytt besked"/"Besked"
 *   /ledighet?godkann=<id>  ansökningsnotisen till en godkännare → godkänn-listan uppfälld, raden markerad
 *   /ledighet?godkann=1     äldre notiser (och "bara öppna listan") → listan uppfälld, ingen rad markerad
 * Id:t används bara för att jämföra mot ansökningar vi redan läst (och som id i DOM:et) — aldrig i en fråga.
 */

/** Hur länge markeringen ligger kvar innan den tonar ut. */
export const MARKERING_MS = 4000;

export type Fokus = {
  /** Egen ansökan som beslutsnotisen gäller. */
  besked: string | null;
  /** Godkänn-listan ska vara uppfälld. */
  godkannOppen: boolean;
  /** Ansökan i godkänn-listan som ska markeras (null för `godkann=1`). */
  godkannId: string | null;
};

export const INGEN_FOKUS: Fokus = { besked: null, godkannOppen: false, godkannId: null };

/** Bara det ett uuid kan innehålla — allt annat (lösa strängar, `<script>`) ignoreras. */
const renId = (v: string | null): string | null => (v && /^[A-Za-z0-9-]{1,64}$/.test(v) ? v : null);

export function lasFokus(search: string): Fokus {
  const p = new URLSearchParams(search);
  const godkann = p.get('godkann');
  return {
    besked: renId(p.get('besked')),
    godkannOppen: !!godkann,
    godkannId: godkann && godkann !== '1' ? renId(godkann) : null,
  };
}
