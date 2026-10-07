import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthApiError } from "../services/auth";
import { PinIcon } from "../components/icons";
import { downloadAnalyticsCsv } from "../features/analytics/exportCsv";
import { getTruckAnalytics, type TruckAnalytics } from "../services/analytics";
import "./analytics.css";

const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<TruckAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getTruckAnalytics(controller.signal)
      .then((report) => { if (!controller.signal.aborted) setData(report); })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setData(null);
        if (reason instanceof AuthApiError && reason.status === 401) navigate("/operator/login", { replace: true });
        else setError(true);
      });
    return () => controller.abort();
  }, [reload, navigate]);

  const trucks = data?.trucks.filter((truck) => !selected || String(truck.vendorId) === selected) ?? [];
  const report = data && { totalTrucks: trucks.length, totalMenuItems: trucks.reduce((n, t) => n + t.menuItemCount, 0), availableMenuItems: trucks.reduce((n, t) => n + t.availableItemCount, 0), upcomingStops: trucks.reduce((n, t) => n + t.upcomingStopCount, 0), trucks };

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <Link className="analytics-brand" to="/">
          <span><PinIcon /></span> BiteMap<span className="analytics-dot">.</span>
        </Link>
        <Link to="/operator">← My workspace</Link>
      </header>

      <main>
        <p className="analytics-eyebrow">OPERATIONS SNAPSHOT</p>
        <h1>Your business at a glance.</h1>
        <p className="analytics-lede">Menu and schedule activity for your trucks. Sales and revenue reporting will be available after ordering is added.</p>

        {!data && !error && <p className="analytics-state" role="status">Loading truck analytics…</p>}
        {error && (
          <div className="analytics-state" role="alert">
            <p>We couldn’t load your analytics. Check that your operator account is active and try again.</p>
            <button type="button" onClick={() => { setError(false); setReload((value) => value + 1); }}>Try again</button>
          </div>
        )}

        {report && (
          <>
            <label className="analytics-filter">Show truck
              <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                <option value="">All my trucks</option>
                {data?.trucks.map((truck) => <option key={truck.vendorId} value={truck.vendorId}>{truck.name}</option>)}
              </select>
            </label>
            <section className="analytics-summary" aria-label="Your truck totals">
              <article><strong>{report.totalTrucks}</strong><span>Trucks</span></article>
              <article><strong>{report.totalMenuItems}</strong><span>Menu items</span></article>
              <article><strong>{report.availableMenuItems}</strong><span>Available items</span></article>
              <article><strong>{report.upcomingStops}</strong><span>Upcoming / ongoing stops</span></article>
            </section>

            <section className="analytics-table-section" aria-labelledby="truck-metrics-title">
              <div className="analytics-table-heading">
                <div>
                  <p className="analytics-eyebrow">TRUCK DETAILS</p>
                  <h2 id="truck-metrics-title">Operational metrics</h2>
                </div>
                {report.trucks.length > 0 && (
                  <button type="button" className="analytics-export" onClick={() => downloadAnalyticsCsv(report)}>
                    Export CSV
                  </button>
                )}
              </div>
              {report.trucks.length === 0 ? (
                <p className="analytics-empty">You haven’t added a truck yet. Create one in your workspace to get started.</p>
              ) : (
                <div className="analytics-table-wrap">
                  <table>
                    <thead><tr><th>Truck</th><th>Menu</th><th>Avg. price</th><th>Stops</th><th>Next / ongoing stop</th></tr></thead>
                    <tbody>
                      {report.trucks.map((truck) => (
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
