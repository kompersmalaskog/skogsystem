'use client';

// Startar bakgrundsköerna för markeringsfoton och maskinkollens foton (lib/markeringFotoKo): foton som tagits utan täckning laddas upp när nätet finns — även om appen öppnas
// på startsidan och inte i planeringsvyn. Ritar ingenting.

import { useEffect } from 'react';
import { startaFotoKoTriggers } from '@/lib/markeringFotoKo';
import { startaMaskinkollFotoKo } from '@/lib/maskinkoll/fotoKo';

export default function FotoKoStartare() {
  useEffect(() => startaFotoKoTriggers(), []);
  // Maskinkollens foton (egen kö) — samma skäl: tas ofta utan täckning i skogen.
  useEffect(() => startaMaskinkollFotoKo(), []);
  return null;
}
