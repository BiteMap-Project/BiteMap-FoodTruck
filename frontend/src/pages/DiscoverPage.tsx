import { useState } from "react";
import StopResults from "../features/discover/StopResults";
import VendorResults from "../features/discover/VendorResults";

type View = "trucks" | "stops";

function DiscoverPage() {
  const [view, setView] = useState<View>("trucks");
  const [search, setSearch] = useState("");

  return (
    <main className="discovery">
      <h1>BiteMap</h1>
      <p>Find mobile food near you.</p>
      <div className="segmented view-toggle" role="group" aria-label="Browse">
        <button type="button" aria-pressed={view === "trucks"} onClick={() => setView("trucks")}>All trucks</button>
        <button type="button" aria-pressed={view === "stops"} onClick={() => setView("stops")}>Schedule &amp; nearby</button>
      </div>
      <label htmlFor="vendor-search">Search trucks, food, or location</label>
      <input
        id="vendor-search"
        type="search"
        maxLength={200}
        placeholder="Search trucks, food, or location..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <hr />
      {view === "trucks"
        ? <VendorResults key={search} search={search} />
        : <StopResults search={search} />}
    </main>
  );
}

export default DiscoverPage;
