import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import FoodTruckCard from "../../components/FoodTruckCard";
import FavoritesPage from "../../pages/FavoritesPage";
import TruckMenuPage from "../../pages/TruckMenuPage";
import AccountNavigation from "../discover/AccountNavigation";
import { resetFavorites } from "./favoritesStore";
import { AuthProvider } from "../../auth/AuthContext";

const fetchMock = vi.fn();
const customer = { id: 5, displayName: "Fan", email: "fan@example.com", roles: ["ROLE_CUSTOMER"] };
const tacos = { id: 7, name: "Taco Truck", category: "Tacos", location: "CSUN" };
const soup = { id: 8, name: "Soup Cart", category: "Soup", location: "Reseda" };
const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
}) as unknown as Response;

let signedIn: boolean;
let saved: number[];
let failWrites: number | null;
let failListOnce: boolean;

beforeEach(() => {
  resetFavorites();
  signedIn = true;
  saved = [];
  failWrites = null;
  failListOnce = false;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/me") return signedIn ? response(200, customer) : response(401);
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" });
    if (url === "/api/customer/favorites/ids") return signedIn ? response(200, { vendorIds: [...saved] }) : response(401);
    if (url.startsWith("/api/customer/favorites?")) {
      if (!signedIn) return response(401);
      if (failListOnce) { failListOnce = false; return response(503, {}); }
      const items = [tacos, soup].filter((truck) => saved.includes(truck.id))
        .map((truck) => ({ ...truck, savedAt: "2026-10-19T18:00:00Z" }));
      return response(200, { items, page: 0, size: 20, totalElements: items.length, totalPages: items.length ? 1 : 0 });
    }
    const write = /^\/api\/customer\/favorites\/(\d+)$/.exec(url);
    if (write) {
      if (failWrites) return response(failWrites, { detail: "nope" });
      const id = Number(write[1]);
      if (init?.method === "PUT" && !saved.includes(id)) saved.push(id);
      if (init?.method === "DELETE") saved = saved.filter((value) => value !== id);
      return response(204);
    }
    if (url === "/api/vendors/7") return response(200, { ...tacos, menu: [] });
    if (url.startsWith("/api/vendors/7/pickup-stop")) return response(404, {});
    return response(500, {});
  });
});

function Where() {
  const location = useLocation();
  return <p>At {location.pathname} returning to {(location.state as { returnTo?: string } | null)?.returnTo ?? "-"}</p>;
}

function show(path: string, element: React.ReactNode, route = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={route} element={element} />
          <Route path="/customer/login" element={<Where />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT" || init?.method === "DELETE");

it("saves and unsaves a truck from its card with CSRF and aria-pressed", async () => {
  show("/trucks", <FoodTruckCard {...tacos} />);
  const button = await screen.findByRole("button", { name: "Save Taco Truck" });
  await waitFor(() => expect(button).toBeEnabled());
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(button).toHaveTextContent("Save");

  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
  expect(button).toHaveTextContent("Saved");
  expect(writes()[0]).toEqual(["/api/customer/favorites/7", expect.objectContaining({
    method: "PUT", credentials: "same-origin", headers: expect.objectContaining({ "X-CSRF-TOKEN": "fresh-token" }),
  })]);

  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
  expect(writes()[1][1]).toEqual(expect.objectContaining({ method: "DELETE" }));
});

it("shows trucks that are already saved as Saved", async () => {
  saved = [7];
  show("/trucks", <><FoodTruckCard {...tacos} /><FoodTruckCard {...soup} /></>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save Taco Truck" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByRole("button", { name: "Save Soup Cart" })).toHaveAttribute("aria-pressed", "false");
  // One shared lookup for every card on the page.
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/customer/favorites/ids")).toHaveLength(1);
});

it("asks guests to sign in and remembers where they were", async () => {
  signedIn = false;
  show("/trucks/7", <TruckMenuPage />, "/trucks/:id");
  const button = await screen.findByRole("button", { name: "Save Taco Truck" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByText("At /customer/login returning to /trucks/7")).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});

it("sends the visitor to sign in if their session ended before saving", async () => {
  show("/trucks", <FoodTruckCard {...tacos} />);
  const button = await screen.findByRole("button", { name: "Save Taco Truck" });
  await waitFor(() => expect(button).toBeEnabled());
  failWrites = 401;
  fireEvent.click(button);
  expect(await screen.findByText("At /customer/login returning to /trucks")).toBeInTheDocument();
});

it("explains a failed save and keeps the button usable", async () => {
  show("/trucks", <FoodTruckCard {...tacos} />);
  const button = await screen.findByRole("button", { name: "Save Taco Truck" });
  await waitFor(() => expect(button).toBeEnabled());
  failWrites = 503;
  fireEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t save this truck");
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(button).toBeEnabled();
});

it("lists favorites, removes one, and shows the empty state", async () => {
  saved = [7, 8];
  show("/favorites", <FavoritesPage />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your favorites");
  expect(await screen.findByText("2 saved trucks")).toBeInTheDocument();
  const list = screen.getByRole("list");
  expect(within(list).getByRole("link", { name: "View Taco Truck" })).toHaveAttribute("href", "/trucks/7");

  fireEvent.click(screen.getByRole("button", { name: "Remove Taco Truck" }));
  expect(await screen.findByText("1 saved truck")).toBeInTheDocument();
  expect(screen.queryByText("Taco Truck")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove Soup Cart" }));
  expect(await screen.findByRole("heading", { name: "No favorites yet." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Find a truck" })).toHaveAttribute("href", "/trucks");
});

it("offers a retry when favorites cannot be loaded", async () => {
  saved = [8];
  failListOnce = true;
  show("/favorites", <FavoritesPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load your favorites");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Soup Cart")).toBeInTheDocument();
});

it("shows a remove failure without losing the list", async () => {
  saved = [7];
  show("/favorites", <FavoritesPage />);
  await screen.findByText("1 saved truck");
  failWrites = 503;
  fireEvent.click(screen.getByRole("button", { name: "Remove Taco Truck" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t remove Taco Truck");
  expect(screen.getByText("Taco Truck")).toBeInTheDocument();
});

it("sends signed-out visitors from the Favorites page to sign in", async () => {
  signedIn = false;
  show("/favorites", <FavoritesPage />);
  expect(await screen.findByText("At /customer/login returning to /favorites")).toBeInTheDocument();
});

it("links customers to Favorites from the account navigation", async () => {
  render(<MemoryRouter><AuthProvider><AccountNavigation /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Favorites" })).toHaveAttribute("href", "/favorites");
});

it("never sends ids or writes to another account: the URL names only the truck", async () => {
  show("/trucks", <FoodTruckCard {...tacos} />);
  const button = await screen.findByRole("button", { name: "Save Taco Truck" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(writes()).toHaveLength(1));
  const [, init] = writes()[0];
  expect(init.body).toBeUndefined();
});

it("clears saved trucks when the customer signs out", async () => {
  saved = [7];
  render(
    <MemoryRouter>
      <AuthProvider>
        <AccountNavigation />
        <FoodTruckCard {...tacos} />
      </AuthProvider>
    </MemoryRouter>,
  );
  const button = await screen.findByRole("button", { name: "Save Taco Truck" });
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "t" });
    if (url === "/api/auth/logout") return response(204);
    if (url === "/api/auth/me") return response(401);
    return response(500, {});
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save Taco Truck" })).toHaveAttribute("aria-pressed", "false"));
  expect(await screen.findByRole("link", { name: /Customer sign in/ })).toBeInTheDocument();
});
