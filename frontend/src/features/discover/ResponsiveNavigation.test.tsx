import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import ResponsiveNavigation from "./ResponsiveNavigation";

vi.mock("../../auth/authState", () => ({ useAuth: () => ({ account: { id: 1 } }) }));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
function show() {
  return render(<MemoryRouter><ResponsiveNavigation><Link to="/orders">My orders</Link></ResponsiveNavigation></MemoryRouter>);
}
it("starts collapsed and opens a labelled modal with a close control", () => {
  show();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  const panel = screen.getByRole("dialog", { name: "Your BiteMap menu" });
  expect(within(panel).getByRole("link", { name: "My orders" })).toBeInTheDocument();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(within(panel).getByRole("button", { name: "Close menu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});
it("closes after navigation without replacing browser history", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "My orders" }));
  expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
});
it("reflects native dialog dismissal and restores scrolling", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent(screen.getByRole("dialog"), new Event("close"));
  expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
  expect(document.body.style.overflow).toBe("");
});
