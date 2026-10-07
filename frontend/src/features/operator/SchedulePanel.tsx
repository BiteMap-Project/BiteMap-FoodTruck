import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cancelStop, createStop, editStop, listStops, type ManagedStop } from "../../services/operatorSchedules";
import { WorkspaceError, type Page } from "../../services/operatorWorkspace";
import ScheduleForm from "./ScheduleForm";

const errorText = (error: unknown) => error instanceof WorkspaceError ? error.message : "Connection interrupted. Reload the schedule to check whether your change was saved before trying again.";
const displayTime = (instant: string, timeZone: string) => new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(instant));

export default function SchedulePanel({ vendorId }: { vendorId: number }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Page<ManagedStop> | null>(null);
  const [editor, setEditor] = useState<ManagedStop | "new" | null>(null);
  const [confirm, setConfirm] = useState<ManagedStop | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    listStops(vendorId, page, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setBlocked(false); }
    }, cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof WorkspaceError && cause.status === 401) navigate("/operator/login", { replace: true });
      else setError(errorText(cause));
    });
    return () => controller.abort();
  }, [vendorId, page, attempt, navigate]);
  function reload(nextPage = page) {
    setData(null); setEditor(null); setConfirm(null); setError(""); setPage(nextPage); setAttempt(a => a + 1);
  }
  async function mutate(action: () => Promise<ManagedStop>) {
    if (lock.current || blocked) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); if (mounted.current) { reload(); setMessage("Schedule saved to BiteMap."); } }
    catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof WorkspaceError && cause.status === 401) navigate("/operator/login", { replace: true });
      else {
        setError(errorText(cause));
        // A lost response may have committed. Never silently repeat a write.
        if (!(cause instanceof WorkspaceError) || cause.status !== 400) setBlocked(true);
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const unavailable = busy || blocked;
  return <section className="ow-panel" aria-label="Truck schedule">
    <div className="ow-toolbar"><h2>Your schedule</h2><button className="od-button od-button-primary" disabled={!data || unavailable || editor !== null || confirm !== null} onClick={() => setEditor("new")}>Add stop</button>
      <button className="od-button od-button-secondary" disabled={busy || (editor !== null && !blocked)} onClick={() => reload()}>Reload schedule{editor !== null && blocked ? " (discard draft)" : ""}</button></div>
    <p>Planned locations, not live GPS. Times are shown in each stop’s time zone. Cancelled and completed stops remain in your history.</p>
    {message && <p role="status" className="ow-message">{message}</p>}
    {error && <p role="alert" className="ow-error">{error}{blocked && " Reload before making another change."}</p>}
    {!data && !error && <p role="status">Loading schedule…</p>}
    {editor !== null && <section className="ow-editor"><h3>{editor === "new" ? "New stop" : `Edit ${editor.venueName}`}</h3>
      <ScheduleForm key={editor === "new" ? "new" : `${editor.id}-${editor.version}`} initial={editor === "new" ? undefined : editor} busy={busy} blocked={blocked} onSave={stop => mutate(() => editor === "new" ? createStop(vendorId, stop) : editStop(vendorId, editor.id, stop, editor.version))} />
      <button disabled={busy} onClick={() => setEditor(null)}>Discard editing</button></section>}
    {data && <>
      <p>{data.totalElements} stops · newest start first</p>
      {!data.items.length && <p>No stops on this page. Add a stop or return to the previous page.</p>}
      {data.items.map(stop => {
        const completed = stop.status === "ended" || Date.parse(stop.endsAt) <= now;
        const editable = !completed && stop.status === "scheduled" && Date.parse(stop.startsAt) > now;
        const cancellable = !completed && ["scheduled", "serving"].includes(stop.status);
        return <article className="ow-menu-row" key={stop.id}><div><h3>{stop.venueName}</h3><p>{stop.address}</p>
          <p>{displayTime(stop.startsAt, stop.timeZone)} – {displayTime(stop.endsAt, stop.timeZone)} ({stop.timeZone})</p>
          <p>{stop.status === "cancelled" ? "Cancelled" : completed ? "Completed" : stop.status === "serving" ? "Serving" : "Scheduled"}</p></div>
          <div className="ow-item-actions"><button disabled={unavailable || !editable || editor !== null || confirm !== null} onClick={() => setEditor(stop)}>Edit {stop.venueName}</button>
            <button disabled={unavailable || !cancellable || editor !== null || confirm !== null} onClick={() => setConfirm(stop)}>Cancel {stop.venueName}</button></div>
          {confirm?.id === stop.id && <div className="ow-cancel-confirm" role="group" aria-label="Confirm cancellation"><p>Cancel {stop.venueName}? It will no longer be advertised as a scheduled stop. Its history is retained.</p><button disabled={unavailable} onClick={() => void mutate(() => cancelStop(vendorId, stop.id, stop.version))}>Confirm cancellation</button><button disabled={busy} onClick={() => setConfirm(null)}>Keep stop</button></div>}
        </article>;
      })}
      <nav className="ow-pagination" aria-label="Schedule pages"><button disabled={busy || editor !== null || confirm !== null || page === 0} onClick={() => reload(page - 1)}>Previous stops</button><span>Page {data.page + 1} of {Math.max(1, data.totalPages)}</span><button disabled={busy || editor !== null || confirm !== null || page + 1 >= data.totalPages} onClick={() => reload(page + 1)}>Next stops</button></nav>
    </>}
  </section>;
}
