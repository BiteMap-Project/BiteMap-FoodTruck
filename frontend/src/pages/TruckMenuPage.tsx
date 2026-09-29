import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getVendor, type VendorProfile } from "../services/vendors";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusViews";

type Result =
  | { status: "loading"; id: string }
  | { status: "success"; id: string; truck: VendorProfile }
  | { status: "missing"; id: string }
  | { status: "error"; id: string };

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function TruckMenuPage() {
  const { id = "" } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ status: "loading", id });

  useEffect(() => {
    const controller = new AbortController();
    getVendor(id, controller.signal).then(
      (truck) => {
        if (!controller.signal.aborted) {
          setResult(truck ? { status: "success", id, truck } : { status: "missing", id });
        }
      },
      () => {
        if (!controller.signal.aborted) setResult({ status: "error", id });
      },
    );
    return () => controller.abort();
  }, [id, attempt]);

  // Never show the previous truck while a different route is loading.
  const current: Result = result.id === id ? result : { status: "loading", id };

  return (
    <main className="truck-profile">
      <Link to="/">← Back to trucks</Link>
      {current.status === "loading" && <LoadingState label="Loading truck…" />}
      {current.status === "missing" && (
        <>
          <h1>Truck not found.</h1>
          <p>This truck may have left BiteMap, or the link may be wrong.</p>
        </>
      )}
      {current.status === "error" && (
        <ErrorState
          message="Unable to load this truck. Please try again."
          onRetry={() => {
            setResult({ status: "loading", id });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      {current.status === "success" && (
        <>
          <h1>{current.truck.name}</h1>
          <p>Category: {current.truck.category}</p>
          <p>Location: {current.truck.location}</p>
          <section aria-labelledby="menu-heading">
            <h2 id="menu-heading">Menu</h2>
            {current.truck.menu.length === 0 ? (
              <EmptyState title="No menu available yet." hint="This truck hasn't posted its menu. Check back later." />
            ) : (
              <ul className="menu-items">
                {current.truck.menu.map((item) => (
                  <li key={item.id}>
                    <div className="menu-item-heading">
                      <h3>{item.name}</h3>
                      <span>{dollars.format(item.price)}</span>
                    </div>
                    {item.description && <p>{item.description}</p>}
                    {!item.available && <p className="unavailable">Currently unavailable</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default TruckMenuPage;
