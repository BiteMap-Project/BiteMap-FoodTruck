import { useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "../components/icons";
import StopResults from "../features/discover/StopResults";
import VendorResults from "../features/discover/VendorResults";
import "../features/discover/discover.css";

type View = "trucks" | "stops";

function DiscoverPage() {
  const [view, setView] = useState<View>("trucks");
  const [search, setSearch] = useState("");

  return (
    <main className="discovery">
      <header className="discovery-header">
        <div>
          <h1>BiteMap</h1>
          <p>Find mobile food near you.</p>
        </div>
        <Link to="/operator/login">Operator sign in</Link>
      </header>

      <div className="search-row">
        <div className="search-field">
          <label htmlFor="vendor-search" className="visually-hidden">Search trucks, food, or location</label>
          <SearchIcon />
          <input
            id="vendor-search"
            type="search"
            maxLength={200}
            placeholder="Search trucks, food, or location..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Browse">
          <button type="button" aria-pressed={view === "trucks"} onClick={() => setView("trucks")}>All trucks</button>
          <button type="button" aria-pressed={view === "stops"} onClick={() => setView("stops")}>Schedule &amp; nearby</button>
        </div>
      </div>

      {view === "trucks"
        ? <VendorResults key={search} search={search} onClearSearch={() => setSearch("")} />
        : <StopResults search={search} />}
    </main>
  );
}

export default DiscoverPage;
