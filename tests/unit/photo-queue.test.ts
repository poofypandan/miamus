import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 161 (Codex, PR #41): a save queued by another tab can name a photo
// this tab has never seen. It must not be read as "already uploaded".

const device = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  createStore: () => "photos",
  get: async (key: string) => device.get(key),
  set: async (key: string, value: unknown) => void device.set(key, value),
  del: async (key: string) => void device.delete(key),
  keys: async () => [...device.keys()],
}));

const provider = { uploadPhotoAt: vi.fn(), reservePhotoPath: vi.fn() };
vi.mock("@/lib/data", () => ({ dataProvider: provider }));

(globalThis as { indexedDB?: unknown }).indexedDB = {};
// A phone that says it is online (Node's navigator has no onLine).
vi.stubGlobal("navigator", { onLine: true });
const photos = await import("@/lib/photo-queue");

const URL_B = "https://s.test/storage/v1/object/public/household-logs/h/pet/b.jpg";

beforeEach(() => {
  provider.uploadPhotoAt.mockReset();
});

describe("ensureUploaded", () => {
  it("uploads a photo another tab queued after this one loaded, before the save may go", async () => {
    await photos.hydratePhotoQueue(); // this tab: nothing waiting
    device.set(URL_B, { path: "h/pet/b.jpg", data: new ArrayBuffer(8), type: "image/jpeg", createdAt: Date.now() });

    provider.uploadPhotoAt.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(photos.ensureUploaded([URL_B])).rejects.toMatchObject({ reason: "pending" });
    expect(device.has(URL_B)).toBe(true);

    provider.uploadPhotoAt.mockResolvedValue(undefined);
    await expect(photos.ensureUploaded([URL_B])).resolves.toBeUndefined();
    expect(provider.uploadPhotoAt).toHaveBeenLastCalledWith("h/pet/b.jpg", expect.any(File));
    expect(device.has(URL_B)).toBe(false);
  });

  it("still treats a photo that is on no device queue as uploaded", async () => {
    await expect(photos.ensureUploaded(["https://s.test/elsewhere.jpg"])).resolves.toBeUndefined();
    expect(provider.uploadPhotoAt).not.toHaveBeenCalled();
  });
});
