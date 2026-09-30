import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "../App";
import { EmptyState, ErrorState, LoadingState } from "./StatusViews";

it("announces loading politely", () => {
  render(<LoadingState label="Loading trucks…" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading trucks…");
});

it("announces errors immediately and offers Retry plus extra actions", () => {
  const onRetry = vi.fn();
  render(<ErrorState message="Something failed." onRetry={onRetry}><button>Go home</button></ErrorState>);
  expect(screen.getByRole("alert")).toHaveTextContent("Something failed.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Go home" })).toBeInTheDocument();
});

it("mentions the connection when the browser is offline", () => {
  vi.stubGlobal("navigator", { ...navigator, onLine: false });
  render(<ErrorState message="Unable to load." />);
  expect(screen.getByRole("alert")).toHaveTextContent("You appear to be offline");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows an empty state with a hint and action", () => {
  render(<EmptyState title="Nothing here." hint="Try again later."><button>Reset</button></EmptyState>);
  expect(screen.getByRole("status")).toHaveTextContent("Nothing here.Try again later.");
  expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
});

it("shows a not-found page for unknown routes", () => {
  render(<MemoryRouter initialEntries={["/no/such/page"]}><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to trucks/ })).toHaveAttribute("href", "/");
});

it("lets the user clear a search that found nothing", async () => {
  vi.useFakeTimers();
  const empty = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => empty });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(screen.getByText("Nothing matched “zzz”.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(screen.getByText("No trucks available yet.")).toBeInTheDocument();
});
