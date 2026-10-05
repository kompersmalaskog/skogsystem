// Serial-GPS-flaggan och beviljade portar — de LILLA funktionerna som startvakten (components/AppStartVakt, i rotlayouten)
// behöver för att veta "har den här datorn serial-GPS?". De bor här och inte i lib/gpsKalla.ts för att gpsKalla drar med sig
// NMEA-parsern och seriedrivrutinen: importerar rotlayouten den får VARJE sida i appen (även telefonerna, som aldrig kör
// serial-GPS) ~20 kB extra JS. gpsKalla importerar och återexporterar härifrån, så alla befintliga importer fungerar oförändrat.

/** localStorage: användaren har valt serial-GPS (sätts när en port testats och gett giltiga rader). */
export const SERIAL_FLAGG = 'gps-serial-vald';

export function harWebSerial(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function serialGpsVald(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(SERIAL_FLAGG) === '1'; } catch { return false; }
}

export function glomSerialGps(): void { try { localStorage.removeItem(SERIAL_FLAGG); } catch { /* */ } }

/** Antal seriportar webbläsaren redan beviljat vår origin (getPorts — bara portar användaren själv valt via requestPort,
 *  aldrig COM6/COM7). 0 om Web Serial saknas eller anropet misslyckas. Startvakten (lib/appStart) räknar en sparad port som
 *  "den här datorn har serial-GPS" även när flaggan ovan är borta. */
export async function antalBeviljadeSerialPortar(): Promise<number> {
  try {
    if (!harWebSerial()) return 0;
    const portar = await (navigator as any).serial.getPorts();
    return Array.isArray(portar) ? portar.length : 0;
  } catch { return 0; }
}
