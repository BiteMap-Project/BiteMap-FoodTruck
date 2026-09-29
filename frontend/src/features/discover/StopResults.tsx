import { useEffect, useState } from "react";
import StopCard from "../../components/StopCard";
import { InvalidFilterError, listStops, type StopPage } from "../../services/stops";
import { resolveWindow, type CustomDates, type When } from "./timeWindow";

type Result =
  | { status: "loading" }
  | { status: "success"; data: StopPage }
  | { status: "invalid"; message: string }
  | { status: "error" };

type Place =
  | { status: "off" }
  | { status: "locating" }
  | { status: "on"; lat: number; lon: number }
  | { status: "denied" }
  | { status: "unavailable" };

const RADIUS_MILES = [1, 5, 10, 25, 50] as const;
const KM_PER_MILE = 1.609344;
const WHEN_LABELS: Record<When, string> = {
  now: "Open now",
  today: "Later today",
  week: "Next 7 days",
  custom: "Pick dates",
};

// ~11 m precision is plenty for a radius search and avoids sending exact coordinates.
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** "Schedule & nearby" view: dated stops filtered by cuisine, time window, and distance. */
function StopResults({ search }: { search: string }) {
  const [cuisine, setCuisine] = useState("");
  const [when, setWhen] = useState<When>("week");
  const [custom, setCustom] = useState<CustomDates>({ from: "", to: "" });
  const [place, setPlace] = useState<Place>({ status: "off" });
  const [radiusMiles, setRadiusMiles] = useState<number>(10);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ status: "loading" });
  const [categories, setCategories] = useState<string[]>([]);

  // A new search (owned by the parent) starts again from the first page.
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setPage(0);
    setResult({ status: "loading" });
  }

  const windowCheck = resolveWindow(when, custom);
  const windowError = "error" in windowCheck ? windowCheck.error : null;
  const lat = place.status === "on" ? place.lat : undefined;
  const lon = place.status === "on" ? place.lon : undefined;

  useEffect(() => {
    if (windowError) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      // Resolve relative windows ("Open now") at request time, not render time.
      const range = resolveWindow(when, custom);
      if ("error" in range) return;
      listStops({
        q: search, cuisine, page, ...range, lat, lon,
        radiusKm: lat === undefined ? undefined : radiusMiles * KM_PER_MILE,
      }, controller.signal).then(
        (data) => {
          if (controller.signal.aborted) return;
          setResult({ status: "success", data });
          setCategories((known) => {
            const next = new Set(known);
            data.items.forEach((stop) => next.add(stop.vendor.category));
            return next.size === known.length ? known : [...next].sort();
          });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult(error instanceof InvalidFilterError
            ? { status: "invalid", message: error.message }
            : { status: "error" });
        },
      );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, cuisine, when, custom, lat, lon, radiusMiles, page, attempt, windowError]);

  /** Every filter change goes back to page 1 and shows loading immediately. */
  function refilter(apply: () => void) {
    apply();
    setPage(0);
    setResult({ status: "loading" });
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setPlace({ status: "unavailable" });
      return;
    }
    setPlace({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => refilter(() => setPlace({
        status: "on", lat: round(position.coords.latitude), lon: round(position.coords.longitude),
      })),
      (error) => setPlace({ status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  const filtersActive = cuisine.trim() !== "" || when !== "week" || place.status === "on";

  function clearFilters() {
    refilter(() => {
      setCuisine("");
      setWhen("week");
      setCustom({ from: "", to: "" });
      setPlace({ status: "off" });
      setRadiusMiles(10);
    });
  }

  return (
    <>
      <form className="filters" aria-label="Filters" onSubmit={(event) => event.preventDefault()}>
        <div className="filter">
          <label htmlFor="filter-cuisine">Cuisine</label>
          <input
            id="filter-cuisine"
            list="filter-cuisine-options"
            maxLength={80}
            placeholder="Any cuisine"
            value={cuisine}
            onChange={(event) => refilter(() => setCuisine(event.target.value))}
          />
          <datalist id="filter-cuisine-options">
            {categories.map((category) => <option key={category} value={category} />)}
          </datalist>
        </div>

        <fieldset className="filter">
          <legend>When</legend>
          <div className="segmented">
            {(Object.keys(WHEN_LABELS) as When[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={when === option}
                onClick={() => refilter(() => setWhen(option))}
              >
                {WHEN_LABELS[option]}
              </button>
            ))}
          </div>
          {when === "custom" && (
            <div className="date-range">
              <label htmlFor="filter-from">From</label>
              <input id="filter-from" type="date" value={custom.from}
                onChange={(event) => refilter(() => setCustom((dates) => ({ ...dates, from: event.target.value })))} />
              <label htmlFor="filter-to">To</label>
              <input id="filter-to" type="date" value={custom.to} min={custom.from || undefined}
                onChange={(event) => refilter(() => setCustom((dates) => ({ ...dates, to: event.target.value })))} />
            </div>
          )}
        </fieldset>

        <fieldset className="filter">
          <legend>Distance</legend>
          {place.status === "on" ? (
            <div className="near-me">
              <label htmlFor="filter-radius">Within</label>
              <select id="filter-radius" value={radiusMiles}
                onChange={(event) => refilter(() => setRadiusMiles(Number(event.target.value)))}>
                {RADIUS_MILES.map((miles) => <option key={miles} value={miles}>{miles} mi</option>)}
              </select>
              <button type="button" onClick={() => refilter(() => setPlace({ status: "off" }))}>
                Stop using my location
              </button>
            </div>
          ) : (
            <button type="button" onClick={locate} disabled={place.status === "locating"}>
              {place.status === "locating" ? "Finding your location…" : "Near me"}
            </button>
          )}
          {place.status === "denied" && (
            <p role="alert">Location access is blocked. Allow it in your browser settings to search near you.</p>
          )}
          {place.status === "unavailable" && (
            <p role="alert">We couldn't get your location. You can still search by name or cuisine.</p>
          )}
        </fieldset>

        {filtersActive && <button type="button" onClick={clearFilters}>Clear filters</button>}
      </form>

      <section aria-label="Schedule results" aria-busy={!windowError && result.status === "loading"}>
        {windowError ? <p role="alert">{windowError}</p> : (
          <>
            {result.status === "loading" && <p role="status">Loading schedules…</p>}
            {result.status === "invalid" && <p role="alert">{result.message}</p>}
            {result.status === "error" && (
              <div role="alert">
                <p>Unable to load schedules. Please try again.</p>
                <button onClick={() => {
                  setResult({ status: "loading" });
                  setAttempt((value) => value + 1);
                }}>Retry</button>
              </div>
            )}
            {result.status === "success" && (
              <>
                <p role="status">
                  {result.data.items.length === 0
                    ? (page > 0 ? "No stops on this page. Go back to the previous page."
                      : filtersActive || search.trim() ? "No trucks match these filters. Try widening your search."
                        : "No trucks are scheduled in the next 7 days.")
                    : `${result.data.totalElements} ${result.data.totalElements === 1 ? "stop" : "stops"} found`}
                </p>
                {result.data.items.map((stop) => <StopCard key={stop.stopId} stop={stop} />)}
                {(result.data.totalPages > 1 || page > 0) && (
                  <nav aria-label="Schedule pagination">
                    <button disabled={page === 0} onClick={() => { setResult({ status: "loading" }); setPage(page - 1); }}>Previous</button>
                    <span> Page {page + 1}{result.data.totalPages > page ? ` of ${result.data.totalPages}` : ""} </span>
                    <button disabled={page + 1 >= result.data.totalPages || page >= 10000}
                      onClick={() => { setResult({ status: "loading" }); setPage(page + 1); }}>Next</button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default StopResults;
