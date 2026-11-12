import { expect, test, type BrowserContext } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STUB_URL, freshSession, installStub } from "./stub-backend";

// Demo check F-4: the owner removes a staff phone (Rumah → Masuk staf → HP yang
// terhubung → Hapus). The phone keeps its anonymous sign-in, but the roster
// comes back empty. It used to say "Belum ada nama terdaftar…", and kept the
// household's menu and recipes on the phone. Now it says the phone was
// removed, and forgets the household as owner sign-out does. Only on the
// server's clear answer: a link check with no answer never reads as removed.

const REMOVED = "HP ini sudah dihapus dari rumah. Minta link baru ke pemilik rumah.";
const NOBODY = "Belum ada nama terdaftar.";
const MENU_KEY = `miamus_menu_v1:${HOUSEHOLD_ID}`;

async function seedCaches(context: BrowserContext) {
  await context.addInitScript(
    ([menuKey]) => {
      if (sessionStorage.getItem("cache-seeded")) return;
      sessionStorage.setItem("cache-seeded", "1");
      localStorage.setItem(menuKey, JSON.stringify({ dishes: [{ name: "Soto ayam" }] }));
      localStorage.setItem("miamus.public-locale", "id");
      // A save and a photo left waiting (idb-keyval's stores, as the app writes them).
      const put = (dbName: string, storeName: string, key: string, value: unknown) => {
        const open = indexedDB.open(dbName);
        open.onupgradeneeded = () => open.result.createObjectStore(storeName);
        open.onsuccess = () => {
          const tx = open.result.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(value, key);
          tx.oncomplete = () => open.result.close();
        };
      };
      put("keyval-store", "keyval", "b11-sync-queue", [{ id: "waiting-1", job: { kind: "chore_finish" } }]);
      put("miamus-photo-queue", "photos", "http://supabase.test/storage/v1/object/public/photos/x.jpg", {
        path: "x.jpg",
        data: new ArrayBuffer(4),
        type: "image/jpeg",
        createdAt: Date.now(),
      });
    },
    [MENU_KEY]
  );
}

/** How many saves and photos are still kept in IndexedDB. */
async function readQueues() {
  const count = (dbName: string, storeName: string, key?: string) =>
    new Promise<number>((resolve) => {
      const open = indexedDB.open(dbName);
      open.onupgradeneeded = () => open.result.createObjectStore(storeName);
      open.onsuccess = () => {
        const store = open.result.transaction(storeName, "readonly").objectStore(storeName);
        const req = key ? store.get(key) : store.count();
        req.onsuccess = () => {
          open.result.close();
          resolve(key ? ((req.result as unknown[] | undefined) ?? []).length : (req.result as number));
        };
      };
    });
  return { outbox: await count("keyval-store", "keyval", "b11-sync-queue"), photos: await count("miamus-photo-queue", "photos") };
}

test("a removed staff phone says so and forgets the household", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, staff: [] });
  await seedCaches(context);
  await context.route(`${STUB_URL}/rest/v1/rpc/get_user_household_ids`, (route) => route.fulfill({ json: [] }));

  await page.goto("/staff");
  await expect(page.getByText(REMOVED)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(NOBODY)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Masuk dengan kode rumah" })).toHaveAttribute("href", "/join/code");

  const stored = await page.evaluate((menuKey) => ({
    tenant: localStorage.getItem("miamus_tenant_id"),
    staff: localStorage.getItem("banyuwangi11:staffId"),
    menu: localStorage.getItem(menuKey),
    locale: localStorage.getItem("miamus.public-locale"),
    marker: localStorage.getItem("miamus.phone-removed"),
  }), MENU_KEY);
  expect(stored).toEqual({ tenant: null, staff: null, menu: null, locale: "id", marker: "1" });

  // Saves and photos waiting to be sent go too, as on sign-out (Codex P2, PR #102).
  await expect.poll(() => page.evaluate(readQueues)).toEqual({ outbox: 0, photos: 0 });

  // Opened again (no household id left on the phone): still "removed".
  await page.reload();
  await expect(page.getByText(REMOVED)).toBeVisible({ timeout: 20_000 });
});

test("no answer from the link check is never read as removed", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, staff: [] });
  await seedCaches(context);
  await context.route(`${STUB_URL}/rest/v1/rpc/get_user_household_ids`, (route) => route.abort("internetdisconnected"));

  await page.goto("/staff");
  await expect(page.getByText(NOBODY)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(REMOVED)).toHaveCount(0);
  const menu = await page.evaluate((menuKey) => localStorage.getItem(menuKey), MENU_KEY);
  expect(menu).not.toBeNull();
});

test("a phone still linked with nobody on the list keeps the usual words", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, staff: [] });
  await context.route(`${STUB_URL}/rest/v1/rpc/get_user_household_ids`, (route) =>
    route.fulfill({ json: [HOUSEHOLD_ID] })
  );
  await page.goto("/staff");
  await expect(page.getByText(NOBODY)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(REMOVED)).toHaveCount(0);
});
