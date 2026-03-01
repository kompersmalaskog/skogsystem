export function formatVolym(v: number): string {
  return v.toLocaleString('sv-SE') + ' m³';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'importerad': return '#666';
    case 'planerad': return '#3b82f6';
    case 'pagaende': return '#f59e0b';
    case 'klar': return '#22c55e';
    default: return '#666';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'importerad': return 'Importerad';
    case 'planerad': return 'Planerad';
    case 'pagaende': return 'Pågående';
    case 'klar': return 'Klar';
    default: return status || 'Okänd';
  }
}

export function getGrotStatusLabel(s: string): string {
  switch (s) {
    case 'ej_aktuellt': return 'Ej aktuellt';
    case 'skotad': return 'Skotad';
    case 'hoglagd': return 'Höglagd';
    case 'flisad': return 'Flisad';
    case 'bortkord': return 'Borttransporterad';
    default: return s || 'Ej aktuellt';
  }
}

export function getGrotStatusColor(s: string): string {
  switch (s) {
    case 'ej_aktuellt': return '#666';
    case 'skotad': return '#3b82f6';
    case 'hoglagd': return '#f59e0b';
    case 'flisad': return '#a855f7';
    case 'bortkord': return '#22c55e';
    default: return '#666';
  }
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getMonadNamn(manad: number | null): string {
  if (!manad) return '';
  const namn = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  return namn[manad - 1] || '';
}

/** Bygg displaynamn från dim_maskin-data */
export function getMaskinDisplayName(m: { tillverkare?: string; modell?: string; maskin_id: string }): string {
  const { tillverkare, modell } = m;
  if (!tillverkare && !modell) return m.maskin_id;
  if (!tillverkare) return modell!;
  if (!modell) return tillverkare;

  // Om modell redan börjar med tillverkare (t.ex. "PONSSE Scorpion Giant 8W")
  if (modell.toLowerCase().startsWith(tillverkare.toLowerCase())) {
    return modell;
  }

  // Om tillverkare är kort kod och modell är varumärke (t.ex. tillverkare="H8E", modell="Rottne")
  if (tillverkare.length <= 5 && !tillverkare.includes(' ') && modell.length > tillverkare.length) {
    return `${modell} ${tillverkare}`;
  }

  // Default: "PONSSE Wisent 2015", "John Deere 810E"
  return `${tillverkare} ${modell}`;
}

/** Avgör skördare/skotare från dim_maskin.typ */
export function getMaskinTyp(typ?: string | null): 'skördare' | 'skotare' {
  if (!typ) return 'skördare';
  const t = typ.toLowerCase();
  if (t === 'forwarder' || t === 'skotare') return 'skotare';
  return 'skördare'; // harvester, skördare, eller okänt
}

/** Bygg aggregat-sträng för skördare */
export function getMaskinAggregatStr(m: { aggregat_tillverkare?: string; aggregat?: string }): string {
  const { aggregat_tillverkare, aggregat } = m;
  if (!aggregat_tillverkare && !aggregat) return '';
  if (!aggregat_tillverkare) return aggregat!;
  if (!aggregat) return aggregat_tillverkare;
  if (aggregat.toLowerCase().startsWith(aggregat_tillverkare.toLowerCase())) return aggregat;
  return `${aggregat_tillverkare} ${aggregat}`;
}
