import { useState } from "react";
import { Link } from "react-router-dom";
import { ClockIcon, PinIcon, SearchIcon } from "../components/icons";
import StopResults from "../features/discover/StopResults";
import VendorResults from "../features/discover/VendorResults";
import "../features/discover/discover.css";

type View = "trucks" | "stops";

function TruckIllustration() {
  return (
    <svg viewBox="0 0 400 240" aria-hidden="true" className="discover-truck">
      <circle cx="254" cy="115" r="101" fill="#f7d7aa" />
      <circle cx="342" cy="47" r="12" fill="#fff8e7" />
      <g stroke="#7b4835" strokeWidth="3" strokeLinejoin="round">
        <path d="M55 213H373" stroke="#bd6b45" />
        <rect x="70" y="72" width="190" height="126" rx="15" fill="#fff8e7" />
        <path d="M260 113h44l40 45v40h-84Z" fill="#d7683f" />
        <path d="M275 126h23l27 31h-50Z" fill="#e8e9d8" />
        <path d="M277 173h12" strokeLinecap="round" />
        <path d="M89 80h148l9 23H80Z" fill="#fff8e7" stroke="none" />
        <path
          d="M94 72h15l-5 28H87Zm39 0h16l-1 28h-19Zm40 0h16l4 28h-19Zm40 0h16l9 28h-19Z"
          fill="#d7683f"
          stroke="none"
        />
        <rect
          x="90"
          y="103"
          width="149"
          height="59"
          rx="3"
          fill="#405749"
          stroke="none"
        />
        <path d="M165 104v57" stroke="#fff8e7" strokeWidth="4" />
        <path
          d="M86 163h156"
          stroke="#d7683f"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M99 180h82m-82 9h53" strokeLinecap="round" />
        <circle cx="116" cy="198" r="19" fill="#2e4037" stroke="none" />
        <circle cx="116" cy="198" r="8" fill="#e8cba4" stroke="none" />
        <circle cx="300" cy="198" r="19" fill="#2e4037" stroke="none" />
        <circle cx="300" cy="198" r="8" fill="#e8cba4" stroke="none" />
        <path
          d="M50 208v-35m0 16-11-11m11 3 10-13"
          stroke="#77885b"
          strokeLinecap="round"
        />
        <path
          d="m192 45-3-10m20 13 4-10m10 18 10-5"
          stroke="#bd6b45"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export default function DiscoverPage() {
  const [view, setView] = useState<View>("trucks");
  const [search, setSearch] = useState("");

  return (
    <div className="discovery">
      <a className="discover-skip" href="#browse">
        Skip to truck search
      </a>

      <aside className="discover-sidebar" aria-label="BiteMap explorer">
        <Link className="discover-brand" to="/" aria-label="BiteMap home">
          <span className="discover-brand-mark">
            <PinIcon />
          </span>
          <span>
            BiteMap<span className="discover-dot">.</span>
          </span>
        </Link>

        <p className="discover-eyebrow sidebar-label">EXPLORE BITEMAP</p>

        <div className="discover-menu" role="group" aria-label="Explore">
          <button
            type="button"
            aria-pressed={view === "trucks"}
            onClick={() => setView("trucks")}
          >
            <SearchIcon /> Discover trucks
          </button>
          <button
            type="button"
            aria-pressed={view === "stops"}
            onClick={() => setView("stops")}
          >
            <ClockIcon /> Upcoming stops
          </button>
          <Link className="discover-menu-link" to="/analytics">
            <span aria-hidden="true">↗</span> Truck insights
          </Link>
        </div>

        <div className="discover-owner-note">
          <span className="discover-spark" aria-hidden="true">
            ✦
          </span>
          <h2>Good food. Great spots.</h2>
          <p>
            Have a kitchen on wheels? Give hungry people a place to find you.
          </p>
          <Link to="/operator/register">
            Join as a truck owner <span aria-hidden="true">→</span>
          </Link>
        </div>

        <Link className="discover-owner-link" to="/operator/login">
          <span className="discover-avatar" aria-hidden="true">
            ↗
          </span>
          <span>
            <strong>Truck owner?</strong>
            <small>Sign in to your workspace</small>
          </span>
        </Link>
      </aside>

      <div className="discover-workspace">
        <header className="discover-topbar">
          <p>
            Explore <span aria-hidden="true">/</span>{" "}
            <strong>Find your next bite</strong>
          </p>
          <span className="discover-top-note">Good food, on the move</span>
        </header>

        <main className="discover-content">
          <div className="discover-intro">
            <p className="discover-eyebrow">FOLLOW YOUR APPETITE</p>
            <h1>Your next great bite, nearby.</h1>
            <p>Find your favorite food trucks. Discover something delicious.</p>
          </div>

          <section
            className="discover-banner"
            aria-labelledby="discover-banner-title"
          >
            <div>
              <p className="discover-eyebrow">
                LOCAL FLAVOR. A LITTLE ADVENTURE.
              </p>
              <h2 id="discover-banner-title">
                Good food.
                <br />
                Wherever it rolls.
              </h2>
              <p>
                Explore the menus. Check the stops.
                <br />
                Make a little room for your next favorite.
              </p>
              <a className="discover-primary" href="#browse">
                Find a food truck <span aria-hidden="true">→</span>
              </a>
            </div>
            <TruckIllustration />
          </section>

          <section
            id="browse"
            className="discover-browse"
            aria-labelledby="discover-browse-title"
          >
            <div className="discover-results-heading">
              <h2 id="discover-browse-title">Find something delicious</h2>
              <p>
                {view === "trucks"
                  ? "Get to know the kitchens on wheels."
                  : "See where they're headed next."}
              </p>
            </div>

            <div className="search-row">
              <div className="search-field">
                <label htmlFor="vendor-search" className="visually-hidden">
                  Search trucks, food, or location
                </label>
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
                <button
                  type="button"
                  aria-pressed={view === "trucks"}
                  onClick={() => setView("trucks")}
                >
                  All trucks
                </button>
                <button
                  type="button"
                  aria-pressed={view === "stops"}
                  onClick={() => setView("stops")}
                >
                  Schedule &amp; nearby
                </button>
              </div>
            </div>

            {view === "trucks" ? (
              <VendorResults
                key={search}
                search={search}
                onClearSearch={() => setSearch("")}
              />
            ) : (
              <StopResults search={search} />
            )}
          </section>

          <footer className="discover-footer">
            BiteMap <span aria-hidden="true">·</span> Good food is worth
            finding.
          </footer>
        </main>
      </div>
    </div>
  );
}
