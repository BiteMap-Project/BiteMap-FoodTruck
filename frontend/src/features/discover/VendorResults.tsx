import { useEffect, useState } from "react";
import FoodTruckCard from "../../components/FoodTruckCard";
import { listVendors, type VendorPage } from "../../services/vendors";

type Result =
  | { status: "loading" }
  | { status: "success"; data: VendorPage }
  | { status: "error" };

/** "All trucks" view. The parent remounts it (via `key`) when the search changes, which resets the page. */
function VendorResults({ search }: { search: string }) {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    // Debounce typing and cancel superseded requests, including on unmount.
    const timer = window.setTimeout(() => {
      listVendors(search, page, controller.signal).then(
        (data) => {
          if (!controller.signal.aborted) setResult({ status: "success", data });
        },
        () => {
          if (!controller.signal.aborted) setResult({ status: "error" });
        },
      );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, attempt]);

  function changePage(next: number) {
    setResult({ status: "loading" });
    setPage(next);
  }

  return (
    <section aria-label="Truck results" aria-busy={result.status === "loading"}>
      {result.status === "loading" && <p role="status">Loading trucks…</p>}
      {result.status === "error" && (
        <div role="alert">
          <p>Unable to load trucks. Please try again.</p>
          <button onClick={() => {
            setResult({ status: "loading" });
            setAttempt((value) => value + 1);
          }}>Retry</button>
        </div>
      )}
      {result.status === "success" && (
        <>
          <p role="status" className="results-count">
            {result.data.items.length === 0
              ? (page > 0 ? "No trucks on this page. Go back to the previous page." : search.trim() ? "No trucks found. Try another search." : "No trucks available yet.")
              : `${result.data.totalElements} ${result.data.totalElements === 1 ? "truck" : "trucks"} found`}
          </p>
          {result.data.items.length > 0 && (
            <div className="card-grid">
              {result.data.items.map((vendor) => <FoodTruckCard key={vendor.id} {...vendor} />)}
            </div>
          )}
          {(result.data.totalPages > 1 || page > 0) && (
            <nav aria-label="Truck pagination" className="pager">
              <button disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
              <span> Page {page + 1}{result.data.totalPages > page ? ` of ${result.data.totalPages}` : ""} </span>
              <button disabled={page + 1 >= result.data.totalPages || page >= 10000} onClick={() => changePage(page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

export default VendorResults;
