'use client';

// Startar bakgrundskön för markeringsfoton (lib/markeringFotoKo): foton som tagits utan täckning laddas upp när nätet finns — även om appen öppnas
// på startsidan och inte i planeringsvyn. Ritar ingenting.

import { useEffect } from 'react';
import { startaFotoKoTriggers } from '@/lib/markeringFotoKo';

export default function FotoKoStartare() {
  useEffect(() => startaFotoKoTriggers(), []);
  return null;
}
