import { expect, it } from "vitest";
import { directionsUrl } from "./directions";

it.each([[NaN, 0], [0, Infinity], [91, 0], [0, -181]])("rejects invalid coordinates %s, %s", (lat, lon) => {
  expect(directionsUrl(lat, lon)).toBeNull();
});

it("accepts valid zero and boundary coordinates", () => {
  expect(directionsUrl(0, 0)).toContain("destination=0%2C0");
  expect(directionsUrl(-90, 180)).toContain("destination=-90%2C180");
});
