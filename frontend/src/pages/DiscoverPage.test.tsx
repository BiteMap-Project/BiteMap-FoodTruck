import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { act, fireEvent, render as renderView, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import DiscoverPage from "./DiscoverPage";
import type { VendorPage } from "../services/vendors";

const render = (view: ReactElement) => renderView(<MemoryRouter>{view}</MemoryRouter>);

const vendor = { id: -2, name: "Database Taco", category: "Tacos", location: "Northridge" };
const data: VendorPage = { items: [vendor], page: 0, size: 20, totalElements: 1, totalPages: 1 };
const fetchMock = vi.fn();
const response = (body: VendorPage) => ({ ok: true, json: async () => body });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });
const search = (value: string) => fireEvent.change(screen.getByRole("searchbox"), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("shows loading then database cards under StrictMode with matching profile links", async () => {
  fetchMock.mockResolvedValue(response(data));
  render(<StrictMode><DiscoverPage /></StrictMode>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading vendors");
  await tick();
  expect(screen.getByRole("heading", { name: vendor.name })).toBeInTheDocument();
  expect(screen.getByText("Location: Northridge")).toBeInTheDocument();
  expect(screen.queryByText(/Open until/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Profile & Menu" })).toHaveAttribute("href", "/trucks/-2");
});

it("debounces search, encodes special characters, and uses backend results", async () => {
  fetchMock.mockResolvedValue(response(data));
  render(<DiscoverPage />);
  await tick();
  search("t");
  search("taco & tea%");
  await tick();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const url = new URL(fetchMock.mock.calls[1][0], "http://localhost");
  expect(url.searchParams.get("q")).toBe("taco & tea%");
  expect(url.searchParams.get("page")).toBe("0");
  expect(url.searchParams.get("size")).toBe("20");
  expect(screen.getByText(vendor.name)).toBeInTheDocument();
});

it("distinguishes an empty database from no matching search results", async () => {
  fetchMock.mockResolvedValue(response({ ...data, items: [], totalElements: 0, totalPages: 0 }));
  render(<DiscoverPage />);
  await tick();
  expect(screen.getByText("No vendors available yet.")).toBeInTheDocument();
  search("no-match");
  await tick();
  expect(screen.getByText(/No vendors found/)).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

it.each(["http", "network", "json"])("shows an error and allows retry after a %s failure", async (kind) => {
  if (kind === "http") fetchMock.mockResolvedValueOnce({ ok: false });
  else if (kind === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
  else fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
  fetchMock.mockResolvedValue(response(data));
  render(<DiscoverPage />);
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load vendors");
  expect(screen.queryByText(/No vendors found/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await tick();
  expect(screen.getByText(vendor.name)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("paginates and resets the page when the search changes", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...data, totalElements: 21, totalPages: 2 }))
    .mockResolvedValueOnce(response({ ...data, page: 1, totalElements: 21, totalPages: 2 }))
    .mockResolvedValue(response(data));
  render(<DiscoverPage />);
  await tick();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await tick();
  expect(fetchMock.mock.calls[1][0]).toContain("page=1");
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  search("taco");
  await tick();
  expect(fetchMock.mock.calls[2][0]).toContain("page=0");
});

it("allows going back when vendors disappear from a later page", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...data, totalElements: 21, totalPages: 2 }))
    .mockResolvedValueOnce(response({ ...data, items: [], page: 1, totalElements: 1, totalPages: 1 }))
    .mockResolvedValue(response(data));
  render(<DiscoverPage />);
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await tick();
  expect(screen.getByText(/No vendors on this page/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  await tick();
  expect(screen.getByText(vendor.name)).toBeInTheDocument();
});

it("ignores an older response that resolves after a newer search", async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(response(data));
  render(<DiscoverPage />);
  await tick();
  const oldSignal = fetchMock.mock.calls[0][1].signal;
  search("new search");
  await tick();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { resolveOld(response({ ...data, items: [{ ...vendor, name: "Stale vendor" }] })); });
  expect(screen.getByText(vendor.name)).toBeInTheDocument();
  expect(screen.queryByText("Stale vendor")).not.toBeInTheDocument();
});

it("cancels the pending request when the page unmounts", async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const { unmount } = render(<DiscoverPage />);
  await tick();
  const signal = fetchMock.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
