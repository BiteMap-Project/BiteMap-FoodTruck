import { useState, type FormEvent } from "react";
import { validateMenuItem } from "../menu/validateMenuItem";
import type { Availability, MenuDetails, MenuItem, Vendor, VendorInput } from "../../services/operatorWorkspace";
import { menuImagePresets } from "../menu/menuImages";
import type { MenuImagePreset } from "../../types/api";

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

export function ItemForm({ initial, onSave, busy }: { initial?: MenuItem; onSave: (input: MenuDetails, status: Availability, imageFile: File | null) => Promise<void>; busy: boolean }) {
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<MenuImagePreset | null>(initial?.hasCustomImage ? null : initial?.imagePreset ?? "GENERIC");
  const [imageFile, setImageFile] = useState<File | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const result = validateMenuItem({ name: String(fields.get("name")), description: String(fields.get("description")), price: String(fields.get("price")), available: true });
    if (!result.ok) { setError(Object.values(result.errors).join(" ")); return; }
    setError("");
    const { name, description, price } = result.value;
    await onSave({ name, description, price, imagePreset: preset }, (fields.get("status") ?? initial?.status ?? "ACTIVE") as Availability, imageFile);
  }
  return <form className="ow-form" aria-label={initial ? "Edit menu item" : "Add menu item"} onSubmit={submit}>
    <fieldset disabled={busy}><label>Item name<input name="name" required maxLength={150} defaultValue={initial?.name} /></label>
      <label>Price (USD)<input name="price" required inputMode="decimal" defaultValue={initial?.price.toFixed(2)} /></label>
      <label>Description<textarea name="description" maxLength={500} defaultValue={initial?.description ?? ""} /></label>
      <fieldset className="ow-image-picker"><legend>Food card image</legend>
        <p>Upload a JPEG, PNG or WebP photo (up to 2 MB, 6000 pixels per side, 12 megapixels) or choose an illustration. Animated images are not supported. Photos are resized and saved as JPEG; transparency uses white.</p>
        <label className="ow-upload">Upload a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0] ?? null;
          if (file && file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); event.target.value = ""; return; }
          setError(""); setImageFile(file); if (file) setPreset(null);
        }} /></label>
        {imageFile && <p className="ow-file-name">Selected: {imageFile.name}</p>}
        {initial?.hasCustomImage && !imageFile && preset === null && <p className="ow-file-name">Current uploaded photo will be kept.</p>}
        <div className="ow-preset-grid">{menuImagePresets.map(option => <label className={preset === option.value ? "is-selected" : ""} key={option.value}>
          <input type="radio" name="imagePreset" value={option.value} checked={preset === option.value} onChange={() => { setPreset(option.value); setImageFile(null); }} />
          <span aria-hidden="true">{option.icon}</span><strong>{option.label}</strong>
        </label>)}</div>
      </fieldset>
      {!initial && <label>Initial availability<select name="status" defaultValue="ACTIVE"><option value="ACTIVE">Available</option><option value="INACTIVE">Not on menu</option><option value="SOLD_OUT">Sold out</option></select></label>}
      {initial && <p>Availability is changed separately. Your existing status will be preserved.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="od-button od-button-primary" type="submit">{busy ? "Saving…" : initial ? "Save item" : "Add item"}</button></fieldset>
  </form>;
}
