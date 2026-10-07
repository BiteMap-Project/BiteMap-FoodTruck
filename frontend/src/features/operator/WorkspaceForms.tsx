import { useState, type FormEvent } from "react";
import { validateMenuItem } from "../menu/validateMenuItem";
import type { Availability, MenuDetails, MenuItem, Vendor, VendorInput } from "../../services/operatorWorkspace";

export function VendorForm({ initial, onSave, busy }: { initial?: Vendor; onSave: (input: VendorInput) => Promise<void>; busy: boolean }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const input = { name: String(fields.get("name")).trim(), category: String(fields.get("category")).trim(), location: String(fields.get("location")).trim() };
    if (!input.name || !input.category || !input.location) { setError("Complete all truck fields."); return; }
    setError("");
    await onSave(input);
  }
  return <form className="ow-form" aria-label={initial ? "Edit truck" : "Create truck"} onSubmit={submit}>
    <fieldset disabled={busy}><label>Truck name<input name="name" required maxLength={120} defaultValue={initial?.name} /></label>
      <label>Cuisine / category<input name="category" required maxLength={80} defaultValue={initial?.category} /></label>
      <label>Location<input name="location" required maxLength={200} defaultValue={initial?.location} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="od-button od-button-primary" type="submit">{busy ? "Saving…" : initial ? "Save truck" : "Create truck"}</button></fieldset>
  </form>;
}

export function ItemForm({ initial, onSave, busy }: { initial?: MenuItem; onSave: (input: MenuDetails, status: Availability) => Promise<void>; busy: boolean }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const result = validateMenuItem({ name: String(fields.get("name")), description: String(fields.get("description")), price: String(fields.get("price")), available: true });
    if (!result.ok) { setError(Object.values(result.errors).join(" ")); return; }
    setError("");
    const { name, description, price } = result.value;
    await onSave({ name, description, price }, (fields.get("status") ?? initial?.status ?? "ACTIVE") as Availability);
  }
  return <form className="ow-form" aria-label={initial ? "Edit menu item" : "Add menu item"} onSubmit={submit}>
    <fieldset disabled={busy}><label>Item name<input name="name" required maxLength={150} defaultValue={initial?.name} /></label>
      <label>Price (USD)<input name="price" required inputMode="decimal" defaultValue={initial?.price.toFixed(2)} /></label>
      <label>Description<textarea name="description" maxLength={500} defaultValue={initial?.description ?? ""} /></label>
      {!initial && <label>Initial availability<select name="status" defaultValue="ACTIVE"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SOLD_OUT">Sold out</option></select></label>}
      {initial && <p>Availability is changed separately. Your existing status will be preserved.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="od-button od-button-primary" type="submit">{busy ? "Saving…" : initial ? "Save item" : "Add item"}</button></fieldset>
  </form>;
}
