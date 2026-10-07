import { useState, type SubmitEvent } from "react";
import type { ManagedStop, StopInput } from "../../services/operatorSchedules";
import { localTime, timeCandidates } from "./scheduleTime";

function validFutureInterval(start: string, end: string) {
  return Date.parse(start) > Date.now() && Date.parse(end) > Date.parse(start);
}

export default function ScheduleForm({ initial, busy, blocked = false, onSave }: { initial?: ManagedStop; busy: boolean; blocked?: boolean; onSave: (stop: StopInput) => Promise<void> }) {
  const [zone, setZone] = useState(initial?.timeZone ?? "America/Los_Angeles");
  const [start, setStart] = useState(initial ? localTime(initial.startsAt, initial.timeZone) : "");
  const [end, setEnd] = useState(initial ? localTime(initial.endsAt, initial.timeZone) : "");
  const [startChoice, setStartChoice] = useState(initial ? timeCandidates(start, zone).find(c => Date.parse(c) === Date.parse(initial.startsAt)) ?? "" : "");
  const [endChoice, setEndChoice] = useState(initial ? timeCandidates(end, zone).find(c => Date.parse(c) === Date.parse(initial.endsAt)) ?? "" : "");
  const [error, setError] = useState("");
  const starts = timeCandidates(start, zone), ends = timeCandidates(end, zone);
  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || blocked) return;
    const startsAt = starts.length === 1 ? starts[0] : starts.find(c => c === startChoice);
    const endsAt = ends.length === 1 ? ends[0] : ends.find(c => c === endChoice);
    if (!startsAt || !endsAt) { setError("Choose valid local times and an IANA time zone. Repeated daylight-saving hours require an offset choice; skipped hours cannot be used."); return; }
    if (!validFutureInterval(startsAt, endsAt)) { setError("Start must be in the future and end must be after start."); return; }
    const values = new FormData(e.currentTarget);
    const venueName = String(values.get("venueName")).trim(), address = String(values.get("address")).trim();
    const latitude = Number(values.get("latitude")), longitude = Number(values.get("longitude"));
    if (!venueName || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { setError("Enter a venue, address and valid coordinates."); return; }
    setError(""); void onSave({ venueName, address, latitude, longitude, startsAt, endsAt, timeZone: zone });
  }
  return <form className="ow-form" aria-label="Schedule stop" onSubmit={handleSubmit}><fieldset disabled={busy || blocked}>
    <label>Venue name<input name="venueName" required maxLength={160} defaultValue={initial?.venueName} /></label>
    <label>Street address<input name="address" required maxLength={300} defaultValue={initial?.address} /></label>
    <p>Enter coordinates for this address. BiteMap does not geocode or verify the location yet.</p>
    <label>Latitude<input name="latitude" type="number" required min={-90} max={90} step="any" defaultValue={initial?.latitude} /></label>
    <label>Longitude<input name="longitude" type="number" required min={-180} max={180} step="any" defaultValue={initial?.longitude} /></label>
    <label>Time zone<input required maxLength={80} value={zone} onChange={e => { setZone(e.target.value); setStartChoice(""); setEndChoice(""); }} placeholder="America/Los_Angeles" /></label>
    <label>Start (local time)<input type="datetime-local" required step="1" value={start} onChange={e => { setStart(e.target.value); setStartChoice(""); }} /></label>
    {starts.length > 1 && <label>Start UTC offset<select required value={startChoice} onChange={e => setStartChoice(e.target.value)}><option value="">Choose repeated hour</option>{starts.map(c => <option key={c} value={c}>{c.slice(-6)}</option>)}</select></label>}
    <label>End (local time)<input type="datetime-local" required step="1" value={end} onChange={e => { setEnd(e.target.value); setEndChoice(""); }} /></label>
    {ends.length > 1 && <label>End UTC offset<select required value={endChoice} onChange={e => setEndChoice(e.target.value)}><option value="">Choose repeated hour</option>{ends.map(c => <option key={c} value={c}>{c.slice(-6)}</option>)}</select></label>}
    <p>One truck cannot have overlapping stops. Different trucks can overlap. Overnight stops are allowed.</p>
    <button className="od-button od-button-primary" type="submit">{busy ? "Saving…" : "Save stop"}</button>
  </fieldset>{error && <p role="alert" className="ow-error">{error}</p>}</form>;
}
