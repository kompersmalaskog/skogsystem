import { describe, it, expect } from "vitest";
import { lasFokus, INGEN_FOKUS, MARKERING_MS } from "./fokus";

const ID = "3cf1147a-88c7-40e6-a05d-a9b8310e05b3";

describe("lasFokus — länken ur en push-notis", () => {
  it("beslutsnotisen: ?besked=<id> → egen ansökan, godkänn-listan orörd", () => {
    expect(lasFokus(`?besked=${ID}`)).toEqual({ besked: ID, godkannOppen: false, godkannId: null });
  });
  it("ansökningsnotisen: ?godkann=<id> → listan uppfälld OCH raden som mål", () => {
    expect(lasFokus(`?godkann=${ID}`)).toEqual({ besked: null, godkannOppen: true, godkannId: ID });
  });
  it("äldre notiser: ?godkann=1 → listan uppfälld, ingen rad som mål (fungerar som förut)", () => {
    expect(lasFokus("?godkann=1")).toEqual({ besked: null, godkannOppen: true, godkannId: null });
  });
  it("ingen parameter / tom / okända → ingen fokus", () => {
    expect(lasFokus("")).toEqual(INGEN_FOKUS);
    expect(lasFokus("?flik=schema")).toEqual(INGEN_FOKUS);
    expect(lasFokus("?besked=&godkann=")).toEqual(INGEN_FOKUS);
  });
  it("ogiltiga id ignoreras (inget annat än bokstäver, siffror och bindestreck kan bli ett DOM-id)", () => {
    expect(lasFokus("?besked=<script>").besked).toBeNull();
    expect(lasFokus("?besked=a b").besked).toBeNull();
    expect(lasFokus(`?besked=${"x".repeat(65)}`).besked).toBeNull();
    // listan öppnas ändå vid ett ogiltigt godkann-id, men ingen rad pekas ut
    expect(lasFokus("?godkann=%3Cb%3E")).toEqual({ besked: null, godkannOppen: true, godkannId: null });
  });
  it("markeringen ligger kvar en kort stund (inte permanent)", () => {
    expect(MARKERING_MS).toBeGreaterThanOrEqual(2000);
    expect(MARKERING_MS).toBeLessThanOrEqual(8000);
  });
});
