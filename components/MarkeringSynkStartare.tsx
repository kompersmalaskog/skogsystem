'use client';

// Startar bakgrundskön för markeringar (lib/markeringSynkKo): markeringar som sparats utan täckning skickas när nätet finns — även om appen öppnas på
// startsidan och inte i planeringsvyn. Ritar ingenting.

import { useEffect } from 'react';
import { startaMarkeringSynkTriggers } from '@/lib/markeringSynkKo';

export default function MarkeringSynkStartare() {
  useEffect(() => startaMarkeringSynkTriggers(), []);
  return null;
}
