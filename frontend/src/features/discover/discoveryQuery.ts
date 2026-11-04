import { useSearchParams } from "react-router-dom";
import type { When } from "./timeWindow";

function date(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}

export function parseDiscoveryQuery(params: URLSearchParams) {
  const rawPage = params.get("page") ?? "0";
  const when = params.get("when") ?? "week";
  const radius = Number(params.get("radius") ?? 10);
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    cuisine: (params.get("cuisine") ?? "").slice(0, 80),
    when: (["week", "now", "today", "custom"].includes(when) ? when : "week") as When,
    from: date(params.get("from")), to: date(params.get("to")),
    page: /^\d+$/.test(rawPage) && Number(rawPage) <= 10000 ? Number(rawPage) : 0,
    radius: [1, 5, 10, 25, 50].includes(radius) ? radius : 10,
  };
}

export function useDiscoveryQuery() {
  const [params, setParams] = useSearchParams();
  const filters = parseDiscoveryQuery(params);
  function update(changes: Partial<typeof filters>, replace = false) {
    const next = { ...filters, page: 0, ...changes };
    // Allowlist shareable filters; never serialize browser geolocation.
    const query = new URLSearchParams();
    if (next.q) query.set("q", next.q);
    if (next.cuisine) query.set("cuisine", next.cuisine);
    if (next.when !== "week") query.set("when", next.when);
    if (next.when === "custom") {
      if (next.from) query.set("from", next.from);
      if (next.to) query.set("to", next.to);
    }
    if (next.page) query.set("page", String(next.page));
    if (next.radius !== 10) query.set("radius", String(next.radius));
    if (query.toString() !== params.toString()) setParams(query, { replace });
  }
  return { ...filters, update };
}
