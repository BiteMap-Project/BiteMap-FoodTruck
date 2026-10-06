import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PinIcon } from "../components/icons";
import { getTruckAnalytics, type TruckAnalytics } from "../services/analytics";
import "./analytics.css";

const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default function AnalyticsPage() {
  const [data, setData] = useState<TruckAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getTruckAnalytics(controller.signal)
      .then(setData)
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [reload]);

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <Link className="analytics-brand" to="/">
          <span><PinIcon /></span> BiteMap<span className="analytics-dot">.</span>
        </Link>
        <Link to="/">← Back to discovery</Link>
      </header>

      <main>
        <p className="analytics-eyebrow">OPERATIONS SNAPSHOT</p>
        <h1>Truck data at a glance.</h1>
        <p className="analytics-lede">Live totals from BiteMap’s PostgreSQL data.</p>

        {!data && !error && <p className="analytics-state" role="status">Loading truck analytics…</p>}
        {error && (
          <div className="analytics-state" role="alert">
            <p>We couldn’t load the analytics.</p>
            <button type="button" onClick={() => { setError(false); setReload((value) => value + 1); }}>Try again</button>
          </div>
        )}

        {data && (
          <>
            <section className="analytics-summary" aria-label="BiteMap totals">
              <article><strong>{data.totalTrucks}</strong><span>Trucks</span></article>
              <article><strong>{data.totalMenuItems}</strong><span>Menu items</span></article>
              <article><strong>{data.availableMenuItems}</strong><span>Available items</span></article>
              <article><strong>{data.upcomingStops}</strong><span>Upcoming stops</span></article>
            </section>

            <section className="analytics-table-section" aria-labelledby="truck-metrics-title">
              <div>
                <p className="analytics-eyebrow">TRUCK DETAILS</p>
                <h2 id="truck-metrics-title">Operational metrics</h2>
              </div>
              {data.trucks.length === 0 ? (
                <p className="analytics-empty">No truck data is available yet.</p>
              ) : (
                <div className="analytics-table-wrap">
                  <table>
                    <thead><tr><th>Truck</th><th>Menu</th><th>Avg. price</th><th>Stops</th><th>Next stop</th></tr></thead>
                    <tbody>
                      {data.trucks.map((truck) => (
                        <tr key={truck.vendorId}>
                          <th scope="row"><Link to={`/trucks/${truck.vendorId}`}>{truck.name}</Link><small>{truck.category} · {truck.location}</small></th>
                          <td>{truck.availableItemCount} of {truck.menuItemCount} available</td>
                          <td>{truck.averageMenuPrice === null ? "—" : price.format(truck.averageMenuPrice)}</td>
                          <td>{truck.upcomingStopCount} upcoming<small>{truck.totalStopCount} total</small></td>
                          <td>{truck.nextStopAt ? date.format(new Date(truck.nextStopAt)) : "None scheduled"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
