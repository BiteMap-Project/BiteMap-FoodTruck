import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadMenuImage, editMenuItem } from "./operatorWorkspace";

const fetchMock = vi.fn();
const token = { headerName: "X-CSRF-TOKEN", token: "test-token" };
const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const file = new File(["photo"], "dish.jpg", { type: "image/jpeg" });
function stalled(signal?: AbortSignal | null) {
  return new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["csrf", "upload", "body"])("stops a stalled %s without retrying the photo write", async stage => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) => {
    if (stage === "csrf") return stalled(options?.signal);
    if (fetchMock.mock.calls.length === 1) return Promise.resolve(response(token));
    if (stage === "body") return Promise.resolve({ ok: true, status: 200, json: () => stalled(options?.signal) });
    return stalled(options?.signal);
  });
  let failure: unknown;
  const pending = uploadMenuImage(7, 10, 3, file).catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(failure).toMatchObject({ status: 408, message: expect.stringContaining("Reload this page") });
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(stage === "csrf" ? 1 : 2);
});

it("also bounds the item-details write that runs before uploading", async () => {
  fetchMock.mockResolvedValueOnce(response(token)).mockImplementation((_url, options) => stalled(options?.signal));
  let failure: unknown;
  const pending = editMenuItem(7, 10, { name: "Rice bowl", description: "", price: 5, imagePreset: null, version: 3 }).catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(failure).toMatchObject({ status: 408 });
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("preserves multipart boundaries, session cookies, CSRF and version on success", async () => {
  fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response({ id: 10, version: 4 }));
  await expect(uploadMenuImage(7, 10, 3, file)).resolves.toEqual({ id: 10, version: 4 });
  const [path, options] = fetchMock.mock.calls[1];
  expect(path).toBe("/api/operator/vendors/7/menu-items/10/image?version=3");
  expect(options).toMatchObject({ method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "X-CSRF-TOKEN": "test-token" } });
  expect(options.headers).not.toHaveProperty("Content-Type");
  expect(options.body.get("file").name).toBe("dish.jpg");
  expect(vi.getTimerCount()).toBe(0);
});

it("treats a lost response as unconfirmed and never retries", async () => {
  fetchMock.mockResolvedValueOnce(response(token)).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(uploadMenuImage(7, 10, 3, file)).rejects.toMatchObject({ status: 0, message: expect.stringContaining("Could not confirm") });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([401, 403, 409])("preserves HTTP %s instead of relabeling it as a timeout", async status => {
  fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce({ ok: false, status });
  await expect(uploadMenuImage(7, 10, 3, file)).rejects.toMatchObject({ status });
  expect(vi.getTimerCount()).toBe(0);
});
