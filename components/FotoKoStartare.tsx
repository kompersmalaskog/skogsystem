'use client';

// Startar bakgrundsköerna för markeringsfoton och maskinkollens foton (lib/markeringFotoKo): foton som tagits utan täckning laddas upp när nätet finns — även om appen öppnas
// på startsidan och inte i planeringsvyn. Ritar ingenting.

import { useEffect } from 'react';
import { startaFotoKoTriggers } from '@/lib/markeringFotoKo';
import { startaMaskinkollFotoKo } from '@/lib/maskinkoll/fotoKo';
import { startaAvvikelseKoTriggers } from '@/lib/avvikelseKo';

export default function FotoKoStartare() {
  useEffect(() => startaFotoKoTriggers(), []);
  // Maskinkollens foton (egen kö) — samma skäl: tas ofta utan täckning i skogen.
  useEffect(() => startaMaskinkollFotoKo(), []);
  // Avvikelserna (bevis på skador, egen kö): fotot och raden skickas när nätet finns.
  useEffect(() => startaAvvikelseKoTriggers(), []);
  return null;
}
