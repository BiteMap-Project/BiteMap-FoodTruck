import { useEffect, useState } from "react";
import FoodTruckCard from "../components/FoodTruckCard";
import { listVendors, type VendorPage } from "../services/vendors";

type Result =
  | { status: "loading" }
  | { status: "success"; data: VendorPage }
  | { status: "error" };

function DiscoverPage() {
  const [search, setSearch] = useState("");
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
    <main className="discovery">
      <h1>BiteMap</h1>
      <p>Find mobile food near you.</p>
      <label htmlFor="vendor-search">Search trucks, food, or location</label>
      <input
        id="vendor-search"
        type="search"
        maxLength={200}
        placeholder="Search trucks, food, or location..."
        value={search}
        onChange={(event) => {
          setResult({ status: "loading" });
          setSearch(event.target.value);
          setPage(0);
        }}
      />
      <hr />
      <section aria-label="Vendor results" aria-busy={result.status === "loading"}>
        {result.status === "loading" && <p role="status">Loading vendors…</p>}
        {result.status === "error" && (
          <div role="alert">
            <p>Unable to load vendors. Please try again.</p>
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
                ? (page > 0 ? "No vendors on this page. Go back to the previous page." : search.trim() ? "No vendors found. Try another search." : "No vendors available yet.")
                : `${result.data.totalElements} ${result.data.totalElements === 1 ? "vendor" : "vendors"} found`}
            </p>
            {result.data.items.map((vendor) => <FoodTruckCard key={vendor.id} {...vendor} />)}
            {(result.data.totalPages > 1 || page > 0) && (
              <nav aria-label="Vendor pagination">
                <button disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
                <span> Page {page + 1}{result.data.totalPages > page ? ` of ${result.data.totalPages}` : ""} </span>
                <button disabled={page + 1 >= result.data.totalPages || page >= 10000} onClick={() => changePage(page + 1)}>Next</button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default DiscoverPage;
