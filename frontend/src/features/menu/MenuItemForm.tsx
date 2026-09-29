import { useRef, useState, type FormEvent } from "react";
import {
  DESCRIPTION_MAX, NAME_MAX, validateMenuItem,
  type MenuItemErrors, type MenuItemFormValues, type MenuItemInput,
} from "./validateMenuItem";
import "./MenuItemForm.css";

type Field = keyof MenuItemErrors;

type Props = {
  /** Existing item when editing; omit to add a new one. */
  initial?: Partial<MenuItemInput>;
  /** Called only with valid, trimmed values. Throw to show a save error. */
  onSubmit: (item: MenuItemInput) => Promise<void> | void;
  submitLabel?: string;
};

const empty: MenuItemFormValues = { name: "", description: "", price: "", available: true };

function toFormValues(initial?: Partial<MenuItemInput>): MenuItemFormValues {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price: initial?.price === undefined ? "" : initial.price.toFixed(2),
    available: initial?.available ?? true,
  };
}

/**
 * Operator form for adding or editing a menu item (SCRUM-37).
 * Errors appear once a field has been left or the form is submitted, and
 * submitting moves focus to the first invalid field.
 */
function MenuItemForm({ initial, onSubmit, submitLabel = "Save item" }: Props) {
  const [values, setValues] = useState<MenuItemFormValues>(() => (initial ? toFormValues(initial) : empty));
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const check = validateMenuItem(values);
  const errors: MenuItemErrors = check.ok ? {} : check.errors;
  const visible = (field: Field) => (submitted || touched[field] ? errors[field] : undefined);

  function update<K extends keyof MenuItemFormValues>(key: K, value: MenuItemFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaveError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!check.ok) {
      const first = (["name", "price", "description"] as Field[]).find((field) => check.errors[field]);
      const target = { name: nameRef, price: priceRef, description: descriptionRef }[first ?? "name"];
      target.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(check.value);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "Couldn't save this item. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const describedBy = (field: Field, extra?: string) =>
    [visible(field) ? `menu-item-${field}-error` : null, extra].filter(Boolean).join(" ") || undefined;
  const nameLength = [...values.name.trim()].length;
  const descriptionLength = [...values.description.trim()].length;

  return (
    <form className="menu-item-form" noValidate onSubmit={handleSubmit} aria-label="Menu item">
      <div className="form-field">
        <label htmlFor="menu-item-name">Name <span aria-hidden="true">*</span></label>
        <input
          id="menu-item-name"
          ref={nameRef}
          required
          value={values.name}
          aria-invalid={Boolean(visible("name"))}
          aria-describedby={describedBy("name", "menu-item-name-count")}
          onChange={(event) => update("name", event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, name: true }))}
        />
        <p id="menu-item-name-count" className="form-count">{nameLength}/{NAME_MAX}</p>
        {visible("name") && <p id="menu-item-name-error" className="form-error">{visible("name")}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="menu-item-price">Price (USD) <span aria-hidden="true">*</span></label>
        <div className="price-input">
          <span aria-hidden="true">$</span>
          <input
            id="menu-item-price"
            ref={priceRef}
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={values.price}
            aria-invalid={Boolean(visible("price"))}
            aria-describedby={describedBy("price")}
            onChange={(event) => update("price", event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, price: true }))}
          />
        </div>
        {visible("price") && <p id="menu-item-price-error" className="form-error">{visible("price")}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="menu-item-description">Description (optional)</label>
        <textarea
          id="menu-item-description"
          ref={descriptionRef}
          rows={3}
          value={values.description}
          aria-invalid={Boolean(visible("description"))}
          aria-describedby={describedBy("description", "menu-item-description-count")}
          onChange={(event) => update("description", event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, description: true }))}
        />
        <p id="menu-item-description-count" className="form-count">{descriptionLength}/{DESCRIPTION_MAX}</p>
        {visible("description") && (
          <p id="menu-item-description-error" className="form-error">{visible("description")}</p>
        )}
      </div>

      <div className="form-field form-checkbox">
        <input
          id="menu-item-available"
          type="checkbox"
          checked={values.available}
          onChange={(event) => update("available", event.target.checked)}
        />
        <label htmlFor="menu-item-available">Available to order</label>
      </div>

      {saveError && <p role="alert" className="form-error">{saveError}</p>}
      <button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export default MenuItemForm;
