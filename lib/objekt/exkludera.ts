// EN plats för exkludera-regeln.
//
// dim_objekt.exkludera sätts i /redigering ("Exkludera från statistik" /
// kommande "Ignorera") och ska gälla ALLA vyer. Tidigare filtrerade varje
// vy själv — och ekonomin glömde: "Flyttobjekt" syntes i ackordjämförelsen
// långt efter att det exkluderats. Vyer får ALDRIG filtrera exkludera med
// egen inline-logik — använd dessa två.
//
//  - Vyer som listar dim_objekt:      hamtaExkluderadeObjektId() + .has()
//  - Vyer som aggregerar fakt_*-rader: utanExkluderade(rows, set)

import { supabase } from '@/lib/supabase';

export async function hamtaExkluderadeObjektId(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('dim_objekt')
    .select('objekt_id')
    .eq('exkludera', true);
  // Ärligt fel — en tyst tom mängd skulle betyda "visa exkluderat skräp
  // som om det vore riktigt". Anroparens error-state ska ta det.
  if (error) throw new Error('Kunde inte läsa exkluderade objekt: ' + error.message);
  return new Set((data || []).map((r: { objekt_id: string }) => r.objekt_id));
}

// Filtrerar bort fakta-rader vars objekt_id är exkluderat. Rader utan
// objekt_id behålls — de kan inte attribueras och ägs av andra regler.
export function utanExkluderade<T extends { objekt_id?: string | null }>(
  rows: T[],
  exkluderade: Set<string>,
): T[] {
  if (exkluderade.size === 0) return rows;
  return rows.filter(r => !r.objekt_id || !exkluderade.has(r.objekt_id));
}
