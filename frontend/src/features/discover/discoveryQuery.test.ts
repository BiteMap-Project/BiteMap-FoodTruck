import { expect, it } from "vitest";
import { parseDiscoveryQuery } from "./discoveryQuery";

it("restores bounded shareable filters", () => {
  expect(parseDiscoveryQuery(new URLSearchParams("q=taco&cuisine=Tacos&when=custom&from=2026-11-03&to=2026-11-05&page=2&radius=25")))
    .toEqual({ q: "taco", cuisine: "Tacos", when: "custom", from: "2026-11-03", to: "2026-11-05", page: 2, radius: 25 });
});
it("uses safe defaults for malformed parameters and impossible dates", () => {
  expect(parseDiscoveryQuery(new URLSearchParams("when=oops&page=1.5&radius=999&from=2026-02-30&to=oops&lat=6&lon=7")))
    .toEqual({ q: "", cuisine: "", when: "week", from: "", to: "", page: 0, radius: 10 });
  for (const page of ["-1", "10001", "Infinity", "1e2", "999999999999999999"]) {
    expect(parseDiscoveryQuery(new URLSearchParams({ page })).page).toBe(0);
  }
});
