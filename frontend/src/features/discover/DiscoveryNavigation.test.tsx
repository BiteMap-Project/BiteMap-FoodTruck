import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { expect, it, vi } from "vitest";
import DiscoverPage from "../../pages/DiscoverPage";
import { AuthProvider } from "../../auth/AuthContext";

vi.mock("../../services/auth", () => ({ getCurrentAccount: vi.fn(async () => null) }));

const stop = {
  stopId: 7, vendor: { id: 2, name: "Taco Mobile", category: "Tacos", location: "CSUN" },
  venueName: "CSUN", address: "18111 Nordhoff St", latitude: 34.24, longitude: -118.53,
  startsAt: "2090-06-10T18:00:00Z", endsAt: "2090-06-10T21:00:00Z",
  timeZone: "America/Los_Angeles", status: "scheduled", lastConfirmedAt: null, distanceMeters: null,
};
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><output aria-label="Current URL">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate(1)}>Browser forward</button></>;
}
function setup(url: string) {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "");
  const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ items: [stop], page: 0, size: 20, totalElements: 41, totalPages: 3 }) }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter initialEntries={[url]}><AuthProvider><Navigation /><Routes>
    <Route path="/stops" element={<DiscoverPage />} />
    <Route path="/" element={<DiscoverPage />} />
    <Route path="/trucks/:id" element={<h1>Truck detail</h1>} />
  </Routes></AuthProvider></MemoryRouter>);
  return fetchMock;
}

it("restores filters after opening a truck and navigating back and forward", async () => {
  setup("/stops");
  await screen.findByText("41 stops found");
  fireEvent.click(screen.getByRole("button", { name: "Open now" }));
  await screen.findByText("41 stops found");
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("when=now");
  fireEvent.click(screen.getByRole("link", { name: "View Profile & Menu" }));
  expect(screen.getByRole("heading", { name: "Truck detail" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  expect(screen.getByRole("button", { name: "Open now" })).toHaveAttribute("aria-pressed", "true");
  await screen.findByText("41 stops found");
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  expect(screen.getByRole("button", { name: "Next 7 days" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  expect(screen.getByRole("button", { name: "Open now" })).toHaveAttribute("aria-pressed", "true");
});

it("hydrates a direct URL, preserves map/list filters, and resets pagination on search", async () => {
  const fetchMock = setup("/stops?q=taco&cuisine=Tacos&when=custom&from=2090-06-10&to=2090-06-11&page=2&radius=25");
  await screen.findByText("41 stops found");
  expect(screen.getByRole("searchbox")).toHaveValue("taco");
  expect(screen.getByLabelText("Cuisine")).toHaveValue("Tacos");
  expect(screen.getByLabelText("From")).toHaveValue("2090-06-10");
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("page=2");
  fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("page=2");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "soup" } });
  await waitFor(() => expect(screen.getByLabelText("Current URL")).toHaveTextContent("q=soup"));
  expect(screen.getByLabelText("Current URL").textContent).not.toContain("page=");
  await screen.findByText("41 stops found");
  const url = String(fetchMock.mock.lastCall?.[0]);
  expect(url).toContain("page=0");
  expect(url).not.toMatch(/[?&](lat|lon)=/);
});
