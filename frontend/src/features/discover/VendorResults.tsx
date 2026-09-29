import { useEffect, useState } from "react";
import FoodTruckCard from "../../components/FoodTruckCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/StatusViews";
import { listVendors, type VendorPage } from "../../services/vendors";

type Result =
  | { status: "loading" }
  | { status: "success"; data: VendorPage }
  | { status: "error" };

/** "All trucks" view. The parent remounts it (via `key`) when the search changes, which resets the page. */
function VendorResults({ search, onClearSearch }: { search: string; onClearSearch: () => void }) {
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
    <section aria-label="Vendor results" aria-busy={result.status === "loading"}>
      {result.status === "loading" && <LoadingState label="Loading vendors…" />}
      {result.status === "error" && (
        <ErrorState
          message="Unable to load vendors. Please try again."
          onRetry={() => {
            setResult({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      {result.status === "success" && result.data.items.length === 0 && (
        page > 0 ? (
          <EmptyState title="No vendors on this page." hint="The list changed since you opened this page.">
            <button type="button" onClick={() => changePage(page - 1)}>Previous page</button>
          </EmptyState>
        ) : search.trim() ? (
          <EmptyState title="No vendors found. Try another search." hint={`Nothing matched “${search.trim()}”.`}>
            <button type="button" onClick={onClearSearch}>Clear search</button>
          </EmptyState>
        ) : (
          <EmptyState title="No vendors available yet." hint="Check back soon as trucks join BiteMap." />
        )
      )}
      {result.status === "success" && (
        <>
          {result.data.items.length > 0 && (
            <>
              <p role="status" className="results-count">
                {`${result.data.totalElements} ${result.data.totalElements === 1 ? "vendor" : "vendors"} found`}
              </p>
              <div className="card-grid">
                {result.data.items.map((vendor) => <FoodTruckCard key={vendor.id} {...vendor} />)}
              </div>
            </>
          )}
          {(result.data.totalPages > 1 || page > 0) && (
            <nav aria-label="Vendor pagination" className="pager">
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
