// SMHI fwif1g (Fire Weather Index Forecast) service
// Endpoints: hourly (48h) + daily (6 days)
// Gratis, ingen nyckel

export interface SmhiFwiHourly {
  hour: number;        // 0-23
  date: string;        // ISO date
  fwiIndex: number;    // MCF class 1-6
  fwi: number;         // numeric FWI
  temp: number;        // °C
  wind: number;        // m/s
  windDir: number;     // degrees
  humidity: number;    // %
  precip: number;      // mm/24h
  grassfire: number;   // grass fire index
}

export interface SmhiFwiDaily {
  date: string;        // ISO date
  dayName: string;     // "Mån", "Tis", etc.
  fwiIndex: number;    // MCF class (peak)
  fwi: number;         // numeric FWI (peak)
  peakHour: number;    // hour of peak
  temp: number;        // max temp
  wind: string;        // "↗ 8 m/s"
  windLevel: string;   // "vdry" | "dry" | ""
  humidity: string;    // "Mycket torr luft" | "Torr luft" | "Fuktigt"
  humLevel: string;    // "vdry" | "dry" | ""
  rain: boolean;       // precipitation > 1mm
  hourlyIdx: number[]; // 24 MCF classes for this day (for fire clock)
}

export interface SmhiBrandriskData {
  hourly: SmhiFwiHourly[];
  daily: SmhiFwiDaily[];
  currentIdx: number;       // MCF class now
  currentFwi: number;       // numeric FWI now
  peakIdx: number;          // MCF class peak today
  peakFwi: number;          // numeric FWI peak today
  peakHour: number;         // hour of peak today
  lowestIdx: number;        // MCF class lowest today
  lowestStartHour: number;  // start hour of lowest period
  lowestEndHour: number;    // end hour of lowest period
  todayHourlyIdx: number[]; // 24 MCF classes for today
  location: string;         // e.g. "56.65°N, 15.85°E"
  updatedAt: string;        // ISO timestamp
}

const WIND_ARROWS: Record<string, string> = {
  N: '↓', NE: '↙', E: '←', SE: '↖',
  S: '↑', SW: '↗', W: '→', NW: '↘',
};

export function degToArrow(deg: number): string {
  // Wind direction is where the wind comes FROM, arrow shows direction it blows TO
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return WIND_ARROWS[dirs[idx]] || '→';
}

export function humidityLevel(rh: number): { text: string; level: string } {
  if (rh < 30) return { text: 'Mycket torr luft', level: 'vdry' };
  if (rh < 45) return { text: 'Torr luft', level: 'dry' };
  return { text: 'Fuktigt', level: '' };
}

export function windLevel(ws: number): string {
  return ws > 7 ? 'vdry' : '';
}

const SWEDISH_DAYS = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

function parseTimeSeries(ts: any): { fwiIndex: number; fwi: number; temp: number; wind: number; windDir: number; humidity: number; precip: number; grassfire: number } {
  const get = (name: string) => {
    const p = ts.parameters?.find((p: any) => p.name === name);
    return p?.values?.[0] ?? 0;
  };
  return {
    fwiIndex: Math.max(1, Math.min(6, Math.round(get('fwiindex')))) || 1,
    fwi: get('fwi') || 0,
    temp: get('t') || 0,
    wind: get('ws') || 0,
    windDir: get('wd') || 0,
    humidity: get('r') || 0,
    precip: get('prec24h') || 0,
    grassfire: get('grassfire') || 0,
  };
}

export async function fetchSmhiFwi(lat: number, lon: number): Promise<SmhiBrandriskData> {
  const rLon = Math.round(lon * 100) / 100;
  const rLat = Math.round(lat * 100) / 100;

  const hourlyUrl = `https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1/hourly/geotype/point/lon/${rLon}/lat/${rLat}/data.json`;
  const dailyUrl = `https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1/daily/geotype/point/lon/${rLon}/lat/${rLat}/data.json`;

  const [hourlyResp, dailyResp] = await Promise.all([
    fetch(hourlyUrl),
    fetch(dailyUrl),
  ]);

  if (!hourlyResp.ok) throw new Error(`SMHI hourly HTTP ${hourlyResp.status}`);
  if (!dailyResp.ok) throw new Error(`SMHI daily HTTP ${dailyResp.status}`);

  const hourlyData = await hourlyResp.json();
  const dailyData = await dailyResp.json();

  const now = new Date();
  const nowHour = now.getHours();
  const todayStr = now.toISOString().split('T')[0];

  // Parse hourly data
  const hourly: SmhiFwiHourly[] = (hourlyData.timeSeries || []).map((ts: any) => {
    const t = new Date(ts.validTime);
    const parsed = parseTimeSeries(ts);
    return {
      hour: t.getHours(),
      date: t.toISOString().split('T')[0],
      ...parsed,
    };
  });

  // Build today's 24-hour MCF index array for fire clock
  const todayHourly = hourly.filter(h => h.date === todayStr);
  const todayHourlyIdx: number[] = Array(24).fill(1);
  for (const h of todayHourly) {
    todayHourlyIdx[h.hour] = h.fwiIndex;
  }

  // Current values (find closest hour)
  const currentEntry = todayHourly.find(h => h.hour === nowHour) || todayHourly[0] || hourly[0];
  const currentIdx = currentEntry?.fwiIndex || 1;
  const currentFwi = currentEntry?.fwi || 0;

  // Peak today
  let peakIdx = 1, peakFwi = 0, peakHour = 12;
  for (const h of todayHourly) {
    if (h.fwi > peakFwi) {
      peakIdx = h.fwiIndex;
      peakFwi = h.fwi;
      peakHour = h.hour;
    }
  }

  // Lowest period today
  let lowestIdx = 6;
  for (const h of todayHourly) {
    if (h.fwiIndex < lowestIdx) lowestIdx = h.fwiIndex;
  }
  const lowestHours = todayHourly.filter(h => h.fwiIndex === lowestIdx).map(h => h.hour);
  const lowestStartHour = lowestHours.length > 0 ? Math.min(...lowestHours) : 0;
  const lowestEndHour = lowestHours.length > 0 ? Math.max(...lowestHours) : 5;

  // Parse daily data into week format
  const dailyTimeSeries = dailyData.timeSeries || [];
  const dailyMap: Map<string, { entries: SmhiFwiHourly[]; dailyParsed: ReturnType<typeof parseTimeSeries> }> = new Map();

  // Group hourly data by date for wind/humidity info
  for (const h of hourly) {
    if (!dailyMap.has(h.date)) {
      dailyMap.set(h.date, { entries: [], dailyParsed: { fwiIndex: 1, fwi: 0, temp: 0, wind: 0, windDir: 0, humidity: 100, precip: 0, grassfire: 0 } });
    }
    dailyMap.get(h.date)!.entries.push(h);
  }

  // Also parse the daily time series for main FWI values
  for (const ts of dailyTimeSeries) {
    const t = new Date(ts.validTime);
    const dateStr = t.toISOString().split('T')[0];
    const parsed = parseTimeSeries(ts);
    if (dailyMap.has(dateStr)) {
      dailyMap.get(dateStr)!.dailyParsed = parsed;
    } else {
      dailyMap.set(dateStr, { entries: [], dailyParsed: parsed });
    }
  }

  const daily: SmhiFwiDaily[] = [];
  const sortedDates = Array.from(dailyMap.keys()).sort();

  for (const dateStr of sortedDates.slice(0, 7)) {
    const dayData = dailyMap.get(dateStr)!;
    const d = new Date(dateStr + 'T12:00:00');
    const entries = dayData.entries;
    const dp = dayData.dailyParsed;

    // Use daily endpoint for main FWI, but hourly entries for details
    const dayFwiIndex = dp.fwiIndex || (entries.length > 0 ? Math.max(...entries.map(e => e.fwiIndex)) : 1);
    const dayFwi = dp.fwi || (entries.length > 0 ? Math.max(...entries.map(e => e.fwi)) : 0);

    // Peak hour from hourly data
    let dayPeakHour = 14;
    let dayPeakFwi = 0;
    for (const e of entries) {
      if (e.fwi > dayPeakFwi) {
        dayPeakFwi = e.fwi;
        dayPeakHour = e.hour;
      }
    }

    // Wind: use peak hour entry or average
    const peakEntry = entries.find(e => e.hour === dayPeakHour) || entries[Math.floor(entries.length / 2)];
    const avgWind = peakEntry ? peakEntry.wind : dp.wind;
    const avgWindDir = peakEntry ? peakEntry.windDir : dp.windDir;
    const minHum = entries.length > 0 ? Math.min(...entries.map(e => e.humidity)) : dp.humidity;
    const maxTemp = entries.length > 0 ? Math.max(...entries.map(e => e.temp)) : dp.temp;
    const totalPrecip = dp.precip || (entries.length > 0 ? entries[0].precip : 0);

    const hum = humidityLevel(minHum);
    const wl = windLevel(avgWind);

    // Build hourly idx for this day
    const dayHourlyIdx: number[] = Array(24).fill(1);
    for (const e of entries) {
      dayHourlyIdx[e.hour] = e.fwiIndex;
    }

    daily.push({
      date: dateStr,
      dayName: dateStr === todayStr ? 'Idag' : SWEDISH_DAYS[d.getDay()],
      fwiIndex: dayFwiIndex,
      fwi: Math.round(dayFwi * 10) / 10,
      peakHour: dayPeakHour,
      temp: `${Math.round(maxTemp)}°`,
      wind: `${degToArrow(avgWindDir)} ${Math.round(avgWind)} m/s`,
      windLevel: wl,
      humidity: hum.text,
      humLevel: hum.level,
      rain: totalPrecip > 1,
      hourlyIdx: dayHourlyIdx,
    });
  }

  return {
    hourly,
    daily,
    currentIdx,
    currentFwi: Math.round(currentFwi * 10) / 10,
    peakIdx,
    peakFwi: Math.round(peakFwi * 10) / 10,
    peakHour,
    lowestIdx,
    lowestStartHour,
    lowestEndHour,
    todayHourlyIdx,
    location: `${rLat.toFixed(2)}°N, ${rLon.toFixed(2)}°E`,
    updatedAt: new Date().toISOString(),
  };
}

// Test/fallback data generator
export function generateTestData(fwiLevel: number): SmhiBrandriskData {
  const now = new Date();
  const nowHour = now.getHours();
  const todayStr = now.toISOString().split('T')[0];

  // Generate realistic hourly pattern
  const todayHourlyIdx: number[] = Array(24).fill(0).map((_, h) => {
    if (h < 6) return Math.max(1, fwiLevel - 2);
    if (h < 10) return Math.max(1, fwiLevel - 1);
    if (h < 16) return fwiLevel;
    if (h < 19) return Math.max(1, fwiLevel - 1);
    return Math.max(1, fwiLevel - 2);
  });

  const hourly: SmhiFwiHourly[] = todayHourlyIdx.map((idx, h) => ({
    hour: h,
    date: todayStr,
    fwiIndex: idx,
    fwi: [0, 3, 8, 14, 19, 24, 30][idx] + Math.random() * 3,
    temp: 15 + (h > 6 && h < 18 ? (h - 6) * 1.5 : 0),
    wind: 3 + Math.random() * 6,
    windDir: 180 + Math.random() * 90,
    humidity: 60 - (h > 6 && h < 16 ? (h - 6) * 3 : 0),
    precip: 0,
    grassfire: idx >= 3 ? 1 : 0,
  }));

  const daily: SmhiFwiDaily[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const dayIdx = Math.max(1, Math.min(6, fwiLevel + Math.floor(Math.random() * 3) - 1));
    const dayFwi = [0, 3, 8, 14, 19, 24, 30][dayIdx] + Math.random() * 3;
    const ws = 3 + Math.random() * 8;
    const rh = 25 + Math.random() * 40;
    const hum = humidityLevel(rh);
    const wl = windLevel(ws);
    const dayHourlyIdx = Array(24).fill(0).map((_, h) => {
      if (h < 6) return Math.max(1, dayIdx - 2);
      if (h < 10) return Math.max(1, dayIdx - 1);
      if (h < 16) return dayIdx;
      if (h < 19) return Math.max(1, dayIdx - 1);
      return Math.max(1, dayIdx - 2);
    });

    daily.push({
      date: dateStr,
      dayName: i === 0 ? 'Idag' : SWEDISH_DAYS[d.getDay()],
      fwiIndex: dayIdx,
      fwi: Math.round(dayFwi * 10) / 10,
      peakHour: 13 + Math.floor(Math.random() * 3),
      temp: `${Math.round(20 + Math.random() * 10)}°`,
      wind: `${degToArrow(180 + Math.random() * 180)} ${Math.round(ws)} m/s`,
      windLevel: wl,
      humidity: hum.text,
      humLevel: hum.level,
      rain: Math.random() > 0.7,
      hourlyIdx: dayHourlyIdx,
    });
  }

  const peakEntry = hourly.reduce((a, b) => a.fwi > b.fwi ? a : b);
  const lowestEntry = hourly.reduce((a, b) => a.fwiIndex < b.fwiIndex ? a : b);
  const lowestHours = hourly.filter(h => h.fwiIndex === lowestEntry.fwiIndex);

  return {
    hourly,
    daily,
    currentIdx: todayHourlyIdx[nowHour] || 1,
    currentFwi: hourly[nowHour]?.fwi || 0,
    peakIdx: peakEntry.fwiIndex,
    peakFwi: Math.round(peakEntry.fwi * 10) / 10,
    peakHour: peakEntry.hour,
    lowestIdx: lowestEntry.fwiIndex,
    lowestStartHour: lowestHours[0]?.hour || 0,
    lowestEndHour: lowestHours[lowestHours.length - 1]?.hour || 5,
    todayHourlyIdx,
    location: 'Testplats',
    updatedAt: new Date().toISOString(),
  };
}
