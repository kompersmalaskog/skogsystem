'use client';

// Startar bakgrundskön för kommentarer på kartan (lib/kartkommentarKo): kommentarer som skrivits utan täckning skickas när nätet finns — även om appen öppnas på
// startsidan och inte i planeringsvyn. Ritar ingenting.

import { useEffect } from 'react';
import { startaKartkommentarTriggers } from '@/lib/kartkommentarKo';

export default function KartkommentarStartare() {
  useEffect(() => startaKartkommentarTriggers(), []);
  return null;
}
