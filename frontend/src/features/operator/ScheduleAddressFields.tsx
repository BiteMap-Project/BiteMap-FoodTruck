import { useEffect, useRef, useState } from "react";
import ActionError from "../../components/ActionError";

export type ScheduleAddress = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  value: ScheduleAddress | null;
  onChange: (value: ScheduleAddress | null) => void;
};

export default function ScheduleAddressFields({ value, onChange }: Props) {
  const [editing, setEditing] = useState(!value);
  const [fields, setFields] = useState({
    street: "",
    city: "",
    state: "CA",
    zip: "",
  });
  const [matches, setMatches] = useState<ScheduleAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function change(name: keyof typeof fields, text: string) {
    active.current?.abort();
    setLoading(false);
    setFields((current) => ({ ...current, [name]: text }));
    setMatches([]);
    setError("");
    onChange(null);
  }

  async function search() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setMatches([]);
    setError("");
    onChange(null);
    const params = new URLSearchParams({ ...fields, country: "US" });
    try {
      const response = await fetch(
        `/api/operator/schedule-addresses?${params}`,
        {
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          response.status === 401
            ? "Your session expired. Sign in again."
            : body?.detail ||
                "Address search failed. Check the address and try again.",
        );
      }
      const results: ScheduleAddress[] = await response.json();
      if (controller.signal.aborted) return;
      setMatches(results);
      if (!results.length)
        setError(
          "No match found. Check the street number, city, state and ZIP code.",
        );
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Address search failed.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="sf-address" aria-label="Stop address">
      <h3>Where will you be?</h3>
      {value && (
        <div className="sf-selected" role="status">
          <p>
            <strong>Selected address:</strong> {value.address}
          </p>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setEditing(true);
            }}
          >
            Change address
          </button>
        </div>
      )}
      {editing && (
        <>
          <label>
            Street address
            <input
              value={fields.street}
              maxLength={100}
              required
              autoComplete="street-address"
              placeholder="18111 Nordhoff St"
              onChange={(e) => change("street", e.target.value)}
            />
          </label>
          <div className="sf-grid">
            <label>
              City
              <input
                value={fields.city}
                maxLength={60}
                required
                autoComplete="address-level2"
                placeholder="Northridge"
                onChange={(e) => change("city", e.target.value)}
              />
            </label>
            <label>
              State abbreviation
              <input
                value={fields.state}
                maxLength={2}
                minLength={2}
                required
                autoComplete="address-level1"
                placeholder="CA"
                onChange={(e) => change("state", e.target.value.toUpperCase())}
              />
            </label>
            <label>
              ZIP code (optional)
              <input
                value={fields.zip}
                maxLength={10}
                autoComplete="postal-code"
                inputMode="numeric"
                placeholder="91325"
                onChange={(e) => change("zip", e.target.value)}
              />
            </label>
            <label>
              Country
              <input value="United States" readOnly />
            </label>
          </div>
          <button
            type="button"
            disabled={
              loading ||
              !fields.street.trim() ||
              !fields.city.trim() ||
              fields.state.length !== 2
            }
            onClick={() => void search()}
          >
            {loading ? "Finding address…" : "Find address"}
          </button>
          <p className="sf-hint">
            Searches go to the U.S. Census Bureau. Choose the matching street
            address; map locations are approximate. U.S. addresses only.
          </p>
          <div className="sf-matches">
            {matches.map((match) => (
              <button
                type="button"
                key={`${match.address}-${match.latitude}-${match.longitude}`}
                onClick={() => {
                  onChange(match);
                  setEditing(false);
                  setMatches([]);
                  setError("");
                }}
              >
                Use {match.address}
              </button>
            ))}
          </div>
        </>
      )}
      <ActionError className="ow-error" message={error} />
    </section>
  );
}
