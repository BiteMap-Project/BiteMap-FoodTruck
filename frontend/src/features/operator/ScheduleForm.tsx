import { useState, type SubmitEvent } from "react";
import type { ManagedStop, StopInput, RepeatRule } from "../../services/operatorSchedules";
import { localTime, timeCandidates } from "./scheduleTime";
import ScheduleAddressFields, {
  type ScheduleAddress,
} from "./ScheduleAddressFields";
import "./scheduleForm.css";
import RepeatScheduleFields, { repeatPreview } from "./RepeatScheduleFields";

const zones = [
  ["America/Los_Angeles", "Pacific — Los Angeles"],
  ["America/Denver", "Mountain — Denver"],
  ["America/Phoenix", "Arizona — Phoenix"],
  ["America/Chicago", "Central — Chicago"],
  ["America/New_York", "Eastern — New York"],
  ["America/Anchorage", "Alaska — Anchorage"],
  ["Pacific/Honolulu", "Hawaii — Honolulu"],
  ["UTC", "UTC"],
];

function picked(candidates: string[], choice: string) {
  return candidates.length === 1
    ? candidates[0]
    : candidates.find((value) => value === choice);
}

function datePlus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function ScheduleForm({
  initial,
  repeat: copyExisting = false,
  busy,
  blocked = false,
  onSave,
}: {
  initial?: ManagedStop;
  repeat?: boolean;
  busy: boolean;
  blocked?: boolean;
  onSave: (stop: StopInput, repeat?: RepeatRule) => Promise<void>;
}) {
  const [zone, setZone] = useState(initial?.timeZone ?? "America/Los_Angeles");
  const [suggested] = useState(
    () => Math.ceil((Date.now() + 60000) / 900000) * 900000,
  );
  
  const [start, setStart] = useState(() =>
    copyExisting
      ? ""
      : localTime(initial?.startsAt ?? suggested, zone),
  );

  const [end, setEnd] = useState(() =>
    copyExisting
      ? ""
      : localTime(initial?.endsAt ?? suggested + 7200000, zone),
  );
  const [startChoice, setStartChoice] = useState(
    () =>
      timeCandidates(start, zone).find(
        (value) =>
          Date.parse(value) ===
          (initial ? Date.parse(initial.startsAt) : suggested),
      ) ?? "",
  );
  const [endChoice, setEndChoice] = useState(
    () =>
      timeCandidates(end, zone).find(
        (value) =>
          Date.parse(value) ===
          (initial ? Date.parse(initial.endsAt) : suggested + 7200000),
      ) ?? "",
  );
  const [address, setAddress] = useState<ScheduleAddress | null>(
    initial ?? null,
  );
  const [error, setError] = useState("");
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const preview = repeatPreview(start.slice(0, 10), initial ? null : repeat);
  const starts = timeCandidates(start, zone),
    ends = timeCandidates(end, zone);
  const startsAt = picked(starts, startChoice),
    endsAt = picked(ends, endChoice);
  const summary =
    startsAt && endsAt
      ? new Intl.DateTimeFormat(undefined, {
          timeZone: zone,
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  function changeStart(value: string) {
    setStart(value);
    setStartChoice("");
    setError("");
  }
  function changeEnd(value: string) {
    setEnd(value);
    setEndChoice("");
    setError("");
  }

    function copyToDate(date: string) {
    if (!date || !initial) {
      changeStart("");
      changeEnd("");
      return;
    }

    const originalStart = localTime(
      initial.startsAt,
      initial.timeZone,
    );

    const originalEnd = localTime(
      initial.endsAt,
      initial.timeZone,
    );

    const dayGap = Math.round(
      (
        Date.parse(`${originalEnd.slice(0, 10)}T12:00:00Z`) -
        Date.parse(`${originalStart.slice(0, 10)}T12:00:00Z`)
      ) / 86400000,
    );

    changeStart(`${date}T${originalStart.slice(11)}`);
    changeEnd(
      `${datePlus(date, dayGap)}T${originalEnd.slice(11)}`,
    );
  }

  function chooseDay(offset: number) {
    const date = datePlus(
      localTime(Date.now(), zone).slice(0, 10),
      offset,
    );

    if (copyExisting) {
      copyToDate(date);
      return;
    }

    const oldDate = start.slice(0, 10);
    const dayGap = Math.round(
      (
        Date.parse(`${end.slice(0, 10)}T12:00Z`) -
        Date.parse(`${oldDate}T12:00Z`)
      ) / 86400000,
    );

    changeStart(`${date}T${start.slice(11) || "11:00"}`);

    changeEnd(
      `${datePlus(
        date,
        Number.isFinite(dayGap) ? Math.max(0, dayGap) : 0,
      )}T${end.slice(11) || "13:00"}`,
    );
  }

  function duration(hours: number) {
    if (!startsAt) {
      setError(
        "Choose a valid start time first, including the repeated-hour choice if shown.",
      );
      return;
    }
    const instant = Date.parse(startsAt) + hours * 3600000;
    const value = localTime(instant, zone);
    setEnd(value);
    setEndChoice(
      timeCandidates(value, zone).find(
        (candidate) => Date.parse(candidate) === instant,
      ) ?? "",
    );
    setError("");
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    if (!address) {
      setError("Find and select a street address before saving.");
      return;
    }
    if (!startsAt || !endsAt) {
      setError(
        "Choose valid times. Skipped daylight-saving hours are unavailable; repeated hours need a choice.",
      );
      return;
    }
    if (
      Date.parse(startsAt) <= Date.now() ||
      Date.parse(endsAt) <= Date.parse(startsAt)
    ) {
      setError(
        "Start must be in the future. End must be later; for an overnight stop, choose the next end date.",
      );
      return;
    }
    if (!initial && repeat && preview.error) {
      setError(preview.error);
      return;
    }
    const venueName = String(
      new FormData(event.currentTarget).get("venueName") ?? "",
    ).trim();
    if (!venueName) {
      setError("Enter a venue name.");
      return;
    }
    setError("");
    void onSave({
      venueName,
      address: address.address,
      latitude: address.latitude,
      longitude: address.longitude,
      startsAt,
      endsAt,
      timeZone: zone,
    }, initial ? undefined : repeat ?? undefined);
  }

  return (
    <form
      className="ow-form sf-form"
      aria-label="Schedule stop"
      onSubmit={submit}
    >
      <fieldset disabled={busy || blocked}>
                {copyExisting && (
          <div className="sf-times">
            <p>
              Choose a new date to reuse this stop’s location and
              local hours. The original stop stays unchanged.
            </p>

            <label>
              New date
              <input
                type="date"
                required
                max="2099-12-31"
                value={start.slice(0, 10)}
                onChange={(event) =>
                  copyToDate(event.target.value)
                }
              />
            </label>
          </div>
        )}
        <label>
          Venue name
          <input
            name="venueName"
            required
            maxLength={160}
            defaultValue={initial?.venueName}
            placeholder="CSUN lunch stop"
          />
        </label>
        <ScheduleAddressFields
          value={address}
          onChange={(value) => {
            setAddress(value);
            setError("");
          }}
        />
        <section className="sf-times" aria-label="Stop hours">
          <h3>When will you be there?</h3>
          <label>
            Time zone
            <select
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setStartChoice("");
                setEndChoice("");
                setError("");
              }}
            >
              {!zones.some(([id]) => id === zone) && (
                <option value={zone}>{zone}</option>
              )}
              {zones.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="sf-hint">
            Choose the venue's time zone. Changing it keeps the clock times
            below.
          </p>
          <div className="sf-shortcuts">
            <button type="button" onClick={() => chooseDay(0)}>
              Today
            </button>
            <button type="button" onClick={() => chooseDay(1)}>
              Tomorrow
            </button>
          </div>
          <div className="sf-grid">
            <label>
              Start date
              <input
                type="date"
                required
                max="2099-12-31"
                value={start.slice(0, 10)}
                onChange={(e) =>
                  changeStart(`${e.target.value}T${start.slice(11) || "11:00"}`)
                }
              />
            </label>
            <label>
              Start time
              <input
                type="time"
                required
                step={
                  start.slice(17, 19) && start.slice(17, 19) !== "00" ? 1 : 60
                }
                value={start.slice(11)}
                onChange={(e) =>
                  changeStart(`${start.slice(0, 10)}T${e.target.value}`)
                }
              />
            </label>
            <label>
              End date
              <input
                type="date"
                required
                max="2099-12-31"
                value={end.slice(0, 10)}
                onChange={(e) =>
                  changeEnd(`${e.target.value}T${end.slice(11) || "13:00"}`)
                }
              />
            </label>
            <label>
              End time
              <input
                type="time"
                required
                step={end.slice(17, 19) && end.slice(17, 19) !== "00" ? 1 : 60}
                value={end.slice(11)}
                onChange={(e) =>
                  changeEnd(`${end.slice(0, 10)}T${e.target.value}`)
                }
              />
            </label>
          </div>
          <div className="sf-shortcuts" aria-label="Set stop duration">
            {[1, 2, 4].map((hours) => (
              <button key={hours} type="button" onClick={() => duration(hours)}>
                Set end: +{hours} {hours === 1 ? "hour" : "hours"}
              </button>
            ))}
          </div>
          {starts.length > 1 && (
            <label>
              Which start time?
              <select
                required
                value={startChoice}
                onChange={(e) => setStartChoice(e.target.value)}
              >
                <option value="">Choose repeated hour</option>
                {starts.map((value, index) => (
                  <option key={value} value={value}>
                    {index === 0 ? "First" : "Second"} occurrence (UTC
                    {value.slice(-6)})
                  </option>
                ))}
              </select>
            </label>
          )}
          {ends.length > 1 && (
            <label>
              Which end time?
              <select
                required
                value={endChoice}
                onChange={(e) => setEndChoice(e.target.value)}
              >
                <option value="">Choose repeated hour</option>
                {ends.map((value, index) => (
                  <option key={value} value={value}>
                    {index === 0 ? "First" : "Second"} occurrence (UTC
                    {value.slice(-6)})
                  </option>
                ))}
              </select>
            </label>
          )}
          {summary && startsAt && endsAt && (
            <p className="sf-summary">
              {summary.format(new Date(startsAt))} →{" "}
              {summary.format(new Date(endsAt))} ({zone})
            </p>
          )}
          <p className="sf-hint">
            Overnight stops are supported. Duration buttons set the end date and
            time for you. Your truck's stops cannot overlap.
          </p>
        </section>
        {!initial && (
          <RepeatScheduleFields
            firstDate={start.slice(0, 10)}
            value={repeat}
            onChange={value => { setRepeat(value); setError(""); }}
          />
        )}
        <button className="od-button od-button-primary" type="submit">
          {busy ? "Saving…" : repeat && !initial ? `Save ${preview.dates.length || "repeating"} stops` : "Save stop"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="ow-error">
          {error}
        </p>
      )}
    </form>
  );
}
