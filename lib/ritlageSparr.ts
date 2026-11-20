// RITLÄGET STÄNGER AV ALL ANNAN TRYCKNING (Martin 2026-10-25, gäller ALLA ritlägen: rita linje och yta, placera symbol, pil, träd, kör upp och backa, mät, larmplats, risa …).
//
// Felet: i ritläget (t.ex. kör upp-pilen) öppnade ett tryck på kartan ändå en symbol, ett område eller en linje under fingret — varje tryckhanterare hade sin egen lista över lägen den skulle
// avstå i, och en ny läge-flagga glömdes lätt. Nu finns EN spärr: medan ett ritläge är på körs bara de klicklyssnare som uttryckligen är märkta som ritläge (`tillatIRitlage`) — alla andra
// 'click'/'dblclick'-lyssnare på kartan (symbolkort, ytkort, linjekort, högar, avlägg, larm …) avstår, också de som läggs till i framtiden. Spärren sitter i `map.on` och `map.off`, så ingen
// enskild hanterare kan glömma den. Läget är på tills det avslutas (Klar eller Avbryt).

const MARKE = '__ritlageTillaten';

/** Märker en klicklyssnare som en del av ritläget självt (den som sätter punkten, symbolen, pilen …): den körs även när spärren är på. */
export function tillatIRitlage<F extends (...args: any[]) => any>(fn: F): F {
  (fn as any)[MARKE] = true;
  return fn;
}

export const arTillatenIRitlage = (fn: unknown): boolean => typeof fn === 'function' && (fn as any)[MARKE] === true;

const SPARRADE_HANDELSER = new Set(['click', 'dblclick']);

/**
 * Lägger spärren på kartan. `arAktivt()` läses vid varje tryck (en ref, inte ett tillstånd). Returnerar en funktion som tar bort spärren igen.
 * `map.on('click', fn)` och `map.on('click', lagerId, fn)` fungerar som vanligt; lyssnaren är bara inslagen. `map.off` slår upp samma inslagning, så avregistrering fungerar.
 */
export function installeraRitlageSparr(map: any, arAktivt: () => boolean): () => void {
  if (map.__ritlageSparr) return () => undefined;   // redan lagd på just den här kartan
  map.__ritlageSparr = true;
  const on = map.on;
  const off = map.off;
  const inslagna = new WeakMap<object, (...a: any[]) => any>();

  const slaIn = (fn: any) => {
    if (typeof fn !== 'function' || arTillatenIRitlage(fn)) return fn;
    let w = inslagna.get(fn);
    if (!w) {
      w = function (this: unknown, ...a: any[]) {
        if (arAktivt()) return undefined;
        return fn.apply(this, a);
      };
      inslagna.set(fn, w);
    }
    return w;
  };
  const ompaketera = (typ: unknown, a: unknown, b: unknown) => {
    if (typeof typ !== 'string' || !SPARRADE_HANDELSER.has(typ)) return [a, b];
    return typeof a === 'function' ? [slaIn(a), b] : [a, slaIn(b)];
  };

  map.on = function (this: unknown, typ: any, a?: any, b?: any) {
    const [x, y] = ompaketera(typ, a, b);
    return y === undefined ? on.call(map, typ, x) : on.call(map, typ, x, y);
  };
  map.off = function (this: unknown, typ: any, a?: any, b?: any) {
    const [x, y] = ompaketera(typ, a, b);
    return y === undefined ? off.call(map, typ, x) : off.call(map, typ, x, y);
  };
  return () => { delete map.on; delete map.off; delete map.__ritlageSparr; };   // metoderna ligger på prototypen: att ta bort vår kopia återställer dem
}
