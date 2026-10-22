import type { RepeatRule } from "../../services/operatorSchedules";

const frequencies = [
  { value: "DAILY", label: "Daily", days: 1 },
  { value: "EVERY_2_DAYS", label: "Every 2 days", days: 2 },
  { value: "WEEKLY", label: "Weekly", days: 7 },
  { value: "EVERY_2_WEEKS", label: "Every 2 weeks", days: 14 },
] as const;

function dateValue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const value = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date
    ? value : NaN;
}

export function repeatPreview(firstDate: string, rule: RepeatRule | null) {
  if (!rule) return { dates: [], error: "" };
  const first = dateValue(firstDate), last = dateValue(rule.until);
  const interval = frequencies.find(option => option.value === rule.frequency)?.days;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !interval) {
    return { dates: [], error: "Choose a first start date and a repeat-through date." };
  }
  const span = Math.round((last - first) / 86400000);
  const count = Math.floor(span / interval) + 1;
  if (span < 0 || span > 365 || count < 2 || count > 52) {
    return { dates: [], error: "Choose 2–52 stops, ending within 365 days of the first start date." };
  }
  const dates = Array.from({ length: count }, (_, index) =>
    new Date(first + index * interval * 86400000).toISOString().slice(0, 10));
  return { dates, error: "" };
}

export default function RepeatScheduleFields({ firstDate, value, onChange }: {
  firstDate: string;
  value: RepeatRule | null;
  onChange: (value: RepeatRule | null) => void;
}) {
  const preview = repeatPreview(firstDate, value);
  const format = (date: string) => new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <section className="sf-times" aria-label="Repeat schedule">
      <h3>Repeat this stop?</h3>
      <label>
        Repeat
        <select
          aria-label="Repeat"
          value={value?.frequency ?? "NONE"}
          onChange={event => onChange(event.target.value === "NONE" ? null : {
            frequency: event.target.value as RepeatRule["frequency"],
            until: value?.until ?? "",
          })}
        >
          <option value="NONE">Does not repeat</option>
          {frequencies.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {value && (
        <>
          <label>
            Repeat through
            <input
              type="date"
              required
              min={firstDate}
              max="2099-12-31"
              value={value.until}
              onChange={event => onChange({ ...value, until: event.target.value })}
            />
          </label>
          <p className="sf-hint">
            Uses the address and venue-local hours above. Weekly repeats on the
            first date's weekday; every 2 weeks means every 14 days. The last
            start date is included if it falls on the pattern. Up to 52 stops.
          </p>
          {preview.error ? <p role="status">{preview.error}</p> : (
            <div className="sf-summary" role="status">
              <strong>{preview.dates.length} stops will be created.</strong>
              <p>First: {format(preview.dates[0])}. Last: {format(preview.dates.at(-1)!)}.</p>
              <p>Dates: {preview.dates.slice(0, 4).map(format).join("; ")}
                {preview.dates.length > 4 ? "; …" : ""}</p>
            </div>
          )}
          <p className="sf-hint">
            All stops save together. Each can then be edited or cancelled
            separately. Nothing repeats beyond this end date.
          </p>
          <details className="sf-hint">
            <summary>Daylight-saving time</summary>
            Clock hours stay the same when the offset changes. If an hour is
            skipped, saving stops with a message identifying that date. For a
            repeated hour, the first stop's UTC offset is used when possible;
            otherwise the first occurrence is used.
          </details>
        </>
      )}
    </section>
  );
}
