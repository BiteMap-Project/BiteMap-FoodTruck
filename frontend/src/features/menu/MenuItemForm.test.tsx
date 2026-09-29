import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MenuItemForm from "./MenuItemForm";

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it("waits until a field is left before showing its error", () => {
  render(<MenuItemForm onSubmit={vi.fn()} />);
  const name = screen.getByLabelText(/Name/);
  type(/Name/, "   ");
  expect(screen.queryByText("Enter a name for this item.")).not.toBeInTheDocument();
  fireEvent.blur(name);
  expect(screen.getByText("Enter a name for this item.")).toBeInTheDocument();
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveAccessibleDescription(/Enter a name for this item\./);
  type(/Name/, "Horchata");
  expect(screen.queryByText("Enter a name for this item.")).not.toBeInTheDocument();
  expect(name).toHaveAttribute("aria-invalid", "false");
});

it("blocks submit, shows all errors and focuses the first invalid field", () => {
  const onSubmit = vi.fn();
  render(<MenuItemForm onSubmit={onSubmit} />);
  type(/Name/, "Horchata");
  fireEvent.click(screen.getByRole("button", { name: "Save item" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText("Enter a price.")).toBeInTheDocument();
  expect(screen.queryByText("Enter a name for this item.")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Price/)).toHaveFocus();
});

it("submits trimmed, parsed values", async () => {
  const onSubmit = vi.fn();
  render(<MenuItemForm onSubmit={onSubmit} />);
  type(/Name/, "  Horchata ");
  type(/Price/, "$3.5");
  type(/Description/, "  Cinnamon rice drink ");
  fireEvent.click(screen.getByLabelText("Available to order"));
  fireEvent.click(screen.getByRole("button", { name: "Save item" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
    name: "Horchata", description: "Cinnamon rice drink", price: 3.5, available: false,
  }));
});

it("prefills an existing item for editing", () => {
  render(<MenuItemForm initial={{ name: "Veggie Taco", description: null, price: 4.5, available: false }}
    onSubmit={vi.fn()} submitLabel="Update item" />);
  expect(screen.getByLabelText(/Name/)).toHaveValue("Veggie Taco");
  expect(screen.getByLabelText(/Price/)).toHaveValue("4.50");
  expect(screen.getByLabelText(/Description/)).toHaveValue("");
  expect(screen.getByLabelText("Available to order")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Update item" })).toBeInTheDocument();
});

it("shows a character count and flags an over-long name", () => {
  render(<MenuItemForm onSubmit={vi.fn()} />);
  type(/Name/, "a".repeat(151));
  expect(screen.getByText("151/150")).toBeInTheDocument();
  fireEvent.blur(screen.getByLabelText(/Name/));
  expect(screen.getByText("Name must be 150 characters or fewer.")).toBeInTheDocument();
});

it("disables the button while saving and shows a save failure", async () => {
  let fail!: (error: Error) => void;
  const onSubmit = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
  render(<MenuItemForm onSubmit={onSubmit} />);
  type(/Name/, "Horchata");
  type(/Price/, "3");
  fireEvent.click(screen.getByRole("button", { name: "Save item" }));
  expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  fail(new Error("A menu item with this name already exists."));
  expect(await screen.findByRole("alert")).toHaveTextContent("A menu item with this name already exists.");
  expect(screen.getByRole("button", { name: "Save item" })).toBeEnabled();
});
