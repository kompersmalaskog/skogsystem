// Avkap-bitarna värderas till MASSA-pris i båda scenarion.
// Energi-prislappen är teknisk artefakt; värdemässigt är rotat virke = massaved.

import type { AvkapUtfall } from './types';
import { isAvkap } from './detect';
import { harledGrupp } from './pris';

export function bmavForlust(
  bottenstockVolym: number,
  timmerPris: number,
  massaPris: number,
): number {
  return bottenstockVolym * (timmerPris - massaPris);
}

export function avkapRaddat(
  avkapVolym: number,
  stock2Volym: number,
  stock2Pris: number,
  massaPris: number,
): number {
  const verkligt = avkapVolym * massaPris + stock2Volym * stock2Pris;
  const alternativ = (avkapVolym + stock2Volym) * massaPris;
  return verkligt - alternativ;
}

export function klassificeraAvkap(
  stock2Namn: string | null | undefined,
  stock2Grupp: string | null | undefined,
): AvkapUtfall {
  if (isAvkap(stock2Namn)) return 'avkap-igen';
  const effGrupp = harledGrupp(stock2Namn, stock2Grupp);
  if (effGrupp === 'Timmer' || effGrupp === 'Klentimmer' || effGrupp === 'Kubb') return 'lyckad';
  if (effGrupp === 'Massa') return 'misslyckad';
  return 'övrigt';
}
