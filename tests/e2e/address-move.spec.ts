import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { HOUSEHOLD_ID, MOCHI, SCHEDULES } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Address move (2026-11-10). A phone still on the old address keeps its
// unsent logs there, where miamus.app can never read them. The app on the old
// address sends them first, keeps them when it can't, and opens miamus.app
// only once nothing is waiting — or after "Pindah sekarang" and a warning.
//
// The old address is played by intercepting every request to it in the
// browser and answering from the local server, so the page really runs on
// http://miamus.vercel.app (the hostname the app checks). miamus.app is
// answered with a placeholder page, to see where the move lands.

const OLD = "http://miamus.vercel.app";
const NEW = "https://miamus.app";
const QUEUE_KEY = "b11-sync-queue";

async function onOldAddress(context: BrowserContext, baseURL: string | undefined) {
  const local = baseURL ?? "http://localhost:3100";
  // The stub's session cookie, on the old address too.
  const cookie = (await context.cookies()).find((c) => c.name.startsWith("sb-supabase-auth-token"));
  if (cookie) await context.addCookies([{ ...cookie, domain: "miamus.vercel.app" }]);

  await context.route(`${OLD}/**`, async (route) => {
    const url = new URL(route.request().url());
    // A blank page on the old address, to put saves in its storage.
    if (url.pathname === "/__seed") return route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" });
    const response = await route.fetch({ url: `${local}${url.pathname}${url.search}`, maxRedirects: 0 });
    return route.fulfill({ response });
  });
  await context.route(`${NEW}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><body><h1>miamus.app</h1></body></html>" })
  );
}

function waitingLog(n: number) {
  const schedule = SCHEDULES.find((s) => s.entity_id === MOCHI.id) ?? SCHEDULES[0];
  return {
    id: `00000000-0000-4000-8000-0000000009${String(n).padStart(2, "0")}`,
    householdId: HOUSEHOLD_ID,
    timestamp: Date.now() - n * 60_000,
    job: {
      kind: "logs",
      payload: {
        entries: [{ schedule_id: schedule.id, entity_id: schedule.entity_id }],
        module: "pet",
        photo_url: null,
        completed_at: new Date(Date.now() - n * 60_000).toISOString(),
        staff_id: STAFF_ID,
      },
      ids: [`00000000-0000-4000-8000-0000000007${String(n).padStart(2, "0")}`],
    },
  };
}

/** Reads or writes the save queue in the old address's own storage (idb-keyval's default store). */
async function oldQueue(page: Page, write?: unknown[]): Promise<{ id: string }[]> {
  await page.goto(`${OLD}/__seed`);
  return page.evaluate(
    ([key, value]) =>
      new Promise<{ id: string }[]>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onupgradeneeded = () => open.result.createObjectStore("keyval");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("keyval", "readwrite");
          const store = tx.objectStore("keyval");
          if (value) store.put(value, key);
          const read = store.get(key);
          tx.oncomplete = () => resolve((read.result as { id: string }[] | undefined) ?? []);
          tx.onerror = () => reject(tx.error);
        };
      }),
    [QUEUE_KEY, write ?? null] as const
  );
}

test("the old address sends the waiting logs first, then opens miamus.app", async ({ context, page, baseURL }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await onOldAddress(context, baseURL);
  await oldQueue(page, [waitingLog(1), waitingLog(2), waitingLog(3)]);
  // Slow saves, so the progress can be seen.
  await context.route("http://supabase.test/rest/v1/task_logs*", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 1_000));
    return route.fallback();
  });

  await page.goto(`${OLD}/staff`);

  await expect(page.getByRole("heading", { name: "Aplikasi ini sudah tidak dipakai" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Mengirim 3 catatan/)).toBeVisible({ timeout: 20_000 });
  // The way out waits for them.
  await expect(page.getByRole("button", { name: "Buka Miamus yang baru" })).toBeDisabled();
  await expect(page.getByText("Semua catatan sudah terkirim. Tidak ada yang tertinggal di HP ini.")).toBeVisible({
    timeout: 20_000,
  });
  // Sent, each once, before anything else.
  expect(stub.logs).toHaveLength(3);
  expect(stub.logs.map((l) => l.staff_id)).toEqual([STAFF_ID, STAFF_ID, STAFF_ID]);
  // The owner's steps, said plainly before the move: sign in again with the
  // house code, swap the home-screen icon; and the link to share.
  await expect(page.getByText("Masuk lagi pakai kode rumah dari admin, lalu PIN Anda.")).toBeVisible();
  await expect(page.getByText(/Tambahkan ke Layar Utama/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salin link" })).toBeVisible();
  await expect(page.getByText("https://miamus.app", { exact: true })).toBeVisible();
  // The staff screen itself is not shown on the old address.
  await expect(page.getByRole("button", { name: /Pipis & Pup/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Buka Miamus yang baru" }).click();
  await expect(page).toHaveURL(`${NEW}/join/code`);
  expect(await oldQueue(page)).toEqual([]);
  expect(stub.seen.realBackend).toEqual([]);
});

test("with no connection it keeps every log, offers Coba lagi, and does not move", async ({ context, page, baseURL }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await onOldAddress(context, baseURL);
  await oldQueue(page, [waitingLog(1), waitingLog(2)]);

  stub.setNetwork(false);
  await page.goto(`${OLD}/staff`);

  await expect(page.getByText("2 catatan masih di HP ini.")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Catatan tetap aman di sini/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  // No way to miamus.app except the deliberate one, and no way back into
  // the old app.
  await expect(page.getByRole("button", { name: "Buka Miamus yang baru" })).toHaveCount(0);
  await expect(page.getByText(/Lanjutkan di sini/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pipis & Pup/ })).toHaveCount(0);
  expect(stub.logs).toHaveLength(0);
  expect(page.url()).toBe(`${OLD}/staff`);

  // The signal is back: "Coba lagi" sends them, and only then the way opens.
  stub.setNetwork(true);
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByText("Semua catatan sudah terkirim. Tidak ada yang tertinggal di HP ini.")).toBeVisible({
    timeout: 30_000,
  });
  expect(stub.logs).toHaveLength(2);
  await expect(page.getByRole("button", { name: "Buka Miamus yang baru" })).toBeVisible();
  expect(stub.seen.realBackend).toEqual([]);
});

test("Pindah sekarang warns first, and the waiting logs stay on the old address", async ({ context, page, baseURL }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await onOldAddress(context, baseURL);
  await oldQueue(page, [waitingLog(1), waitingLog(2)]);

  stub.setNetwork(false);
  await page.goto(`${OLD}/staff`);
  await expect(page.getByText("2 catatan masih di HP ini.")).toBeVisible({ timeout: 45_000 });

  // First tap only warns; "Batal" stays.
  await page.getByRole("button", { name: "Pindah sekarang" }).click();
  // Next's route announcer is an alert too.
  const warning = page.getByRole("alert").filter({ hasText: "Pindah tanpa" });
  await expect(warning).toContainText("Pindah tanpa catatan ini?");
  await expect(warning).toContainText("2 catatan yang menunggu tetap tertinggal di alamat lama");
  await warning.getByRole("button", { name: "Batal" }).click();
  await expect(warning).toHaveCount(0);
  expect(page.url()).toBe(`${OLD}/staff`);

  // Chosen deliberately: it moves, and nothing was thrown away.
  await page.getByRole("button", { name: "Pindah sekarang" }).click();
  await warning.getByRole("button", { name: "Ya, pindah sekarang" }).click();
  await expect(page).toHaveURL(`${NEW}/join/code`);
  expect((await oldQueue(page)).map((item) => item.id)).toEqual([waitingLog(1).id, waitingLog(2).id]);
  expect(stub.logs).toHaveLength(0);
});

test("an owner on the old address reads the move in their own language", async ({ context, page, baseURL }) => {
  await installStub(context, { owner: { locale: "en" } });
  await onOldAddress(context, baseURL);

  await page.goto(`${OLD}/dashboard`);

  await expect(page.getByRole("heading", { name: "This app is no longer in use" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nothing is waiting on this phone.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Sign in again with Google/)).toBeVisible();
  await page.getByRole("button", { name: "Open the new Miamus" }).click();
  await expect(page).toHaveURL(`${NEW}/dashboard`);
});

test("the current address shows the app as before", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: /Pipis & Pup/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Aplikasi ini sudah tidak dipakai")).toHaveCount(0);
});
