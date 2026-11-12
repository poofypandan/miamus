import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STUB_URL, freshSession, installStub } from "./stub-backend";

// Starter templates and staff in one go (Phase 172 PR A2, migrations/147):
// the kind of home opens a ready list the owner unticks; staff names with a
// job chip; one call adds it all; one WhatsApp message carries the house
// link; a staff phone picks its name and makes a PIN. Existing households
// get the same list as Starter list, with what they have marked Added and
// never sent twice. Answered here, after the stub (the newest route wins).

const NEWCOMER = "00000000-0000-4000-8000-00000000e0aa";

interface Calls {
  rpc: { name: string; body: Record<string, unknown> }[];
}

type Payload = {
  rooms: { key: string; name: string; parent: string | null }[];
  staff: { key: string; name: string }[];
  chores: { title: string; place: string | null; category: string; assignee: Record<string, string> | null; from_bills?: true }[];
};

async function answerSetup(context: BrowserContext, theirRooms: string[] = []): Promise<Calls> {
  const calls: Calls = { rpc: [] };
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const body = route.request().postDataJSON() ?? {};
    if (["apply_household_setup", "record_household_setup", "my_house_code", "staff_claims_today", "staff_claim_link"].includes(name)) {
      calls.rpc.push({ name, body });
    }
    if (name === "apply_household_setup") {
      const draft = body.p_draft as Payload;
      return route.fulfill({
        json: {
          // The household's own rooms are reused by name (as the database does).
          rooms_added: draft.rooms.filter((r) => !theirRooms.includes(r.name)).length,
          chores_added: draft.chores.filter((c) => !c.from_bills).length,
          bills_added: draft.chores.filter((c) => c.from_bills).length,
          staff_added: draft.staff.length,
          skipped: 0,
          staff: {},
        },
      });
    }
    if (name === "record_household_setup") return route.fulfill({ status: 204, body: "" });
    if (name === "my_house_code") return route.fulfill({ json: "K7PM2Q" });
    if (name === "staff_claim_link") return route.fulfill({ json: "ABCDEFGHJK" });
    if (name === "staff_claims_today") return route.fulfill({ json: [] });
    return route.fallback();
  });
  await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  return calls;
}

const footer = (page: Page) => page.getByText(/\d+ rooms · \d+ chores · \d+ bills/);

test("sign-up asks what kind of home, saves the answer and opens its starter list", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(NEWCOMER, false) });
  await context.addInitScript(() => localStorage.setItem("miamus.owner-locale", "en"));
  const calls: Calls = { rpc: [] };
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    calls.rpc.push({ name, body: route.request().postDataJSON() ?? {} });
    if (name === "my_locale") return route.fulfill({ json: "en" });
    if (name === "my_household_access") return route.fulfill({ json: "approved" });
    if (name === "create_household") return route.fulfill({ json: "00000000-0000-4000-8000-0000000000f1" });
    if (name === "record_household_setup") return route.fulfill({ status: 204, body: "" });
    return route.fallback();
  });
  await context.route(`${STUB_URL}/auth/v1/user*`, (route) =>
    route.fulfill({ json: { id: NEWCOMER, aud: "authenticated", role: "authenticated", email: "sam@example.test", is_anonymous: false } })
  );

  await page.goto("/onboarding");
  await page.getByLabel("Name your home").fill("The Lee Residence", { timeout: 20_000 });
  await page.getByRole("button", { name: "Create home" }).click();

  // Screen 2: one choice, nothing pre-selected, Skip in the corner.
  await expect(page.getByRole("heading", { name: "What kind of home?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await page.getByRole("radio", { name: /Big house, several floors/ }).click();
  const opened = page.waitForRequest((r) => r.url().includes("/setup?home=multi_floor"));
  await cont.click();
  await opened;
  const records = calls.rpc.filter((c) => c.name === "record_household_setup").map((c) => c.body.p_fields);
  expect(records).toContainEqual({ home_type: "multi_floor", typed_fields: 1 });
  expect(records.some((f) => (f as Record<string, unknown>).started_at)).toBe(true);
});

test("the review: untick a room, one stepper tap, two staff with jobs, Add, then one WhatsApp message", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, chores: [], rooms: [] });
  const calls = await answerSetup(context);

  await page.goto("/setup?home=multi_floor");
  await expect(page.getByRole("heading", { name: "Your home" })).toBeVisible({ timeout: 20_000 });
  // Appendix A: the big house's starting list, everything ticked.
  await expect(footer(page)).toHaveText("25 rooms · 52 chores · 9 bills");
  // Indonesian names, as staff read them, with the English meaning beside.
  await expect(page.getByRole("checkbox", { name: "Gudang", exact: true })).toBeVisible();
  await expect(page.getByText("Store room").first()).toBeVisible();

  await page.getByRole("checkbox", { name: "Gudang", exact: true }).click();
  await expect(footer(page)).toHaveText("24 rooms · 51 chores · 9 bills");
  await page.getByRole("button", { name: "Fewer bedrooms" }).click();
  await expect(footer(page)).toHaveText("23 rooms · 49 chores · 9 bills");

  await page.getByRole("button", { name: "Next: your staff" }).click();
  await expect(page.getByRole("heading", { name: "Your staff" })).toBeVisible();
  await page.getByLabel("Staff name 1").fill("Sari");
  await page.getByRole("group", { name: "Job" }).first().getByRole("button", { name: "Kitchen" }).click();
  await expect(page.getByText("4 chores for Sari")).toBeVisible();
  await page.getByRole("button", { name: "Add another" }).click();
  await page.getByLabel("Staff name 2").fill("Budi");
  await page.getByRole("group", { name: "Job" }).nth(1).getByRole("button", { name: "Garden" }).click();

  // Four kinds would wrap: the button says what it does (demo check F-6).
  await page.getByRole("button", { name: "Set up my home" }).click();
  await expect(page.getByRole("heading", { name: "Your home is ready" })).toBeVisible();

  const apply = calls.rpc.find((c) => c.name === "apply_household_setup");
  expect(apply?.body.p_household).toBe(HOUSEHOLD_ID);
  const draft = apply?.body.p_draft as Payload;
  expect(draft.rooms.some((r) => r.name === "Gudang")).toBe(false);
  expect(draft.rooms.some((r) => r.name === "Kamar Tidur 5")).toBe(false);
  expect(draft.chores).toHaveLength(58);
  expect(draft.staff.map((s) => s.name)).toEqual(["Sari", "Budi"]);
  const sari = draft.staff.find((s) => s.name === "Sari")!.key;
  const budi = draft.staff.find((s) => s.name === "Budi")!.key;
  expect(draft.chores.find((c) => c.title === "Cuci piring")?.assignee).toEqual({ staff: sari });
  expect(draft.chores.find((c) => c.title === "Potong rumput")?.assignee).toEqual({ staff: budi });
  expect(draft.chores.find((c) => c.title === "Sapu dan pel lantai")?.assignee).toBeNull();

  // The setup's own numbers: the path, the two names typed, one untick.
  const finished = calls.rpc.filter((c) => c.name === "record_household_setup").map((c) => c.body.p_fields as Record<string, unknown>);
  expect(finished.some((f) => f.started_at)).toBe(true);
  expect(finished.some((f) => f.finished_at)).toBe(true);
  expect(finished.find((f) => f.path === "template")).toMatchObject({
    path: "template",
    typed_fields: 2,
    unticked: 1,
    rooms_added: 23,
    chores_added: 49,
    bills_added: 9,
    staff_added: 2,
  });

  // One WhatsApp message, the code in the link's fragment.
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Send one WhatsApp message" }).click();
  const wa = await popup;
  const text = new URL(wa.url()).searchParams.get("text") ?? "";
  await wa.close();
  expect(text).toContain("pilih nama Anda, lalu buat PIN");
  // The claim code rides beside the house code (audit L5).
  expect(text).toMatch(/\/join\/code#c=K7P-M2Q&k=ABCDEFGHJK$/);
});

test("Starter list on Chores: what the household has is Added and never sent again", async ({ context, page }) => {
  const day = new Date();
  const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const loc = (id: string, name: string, kind: "room" | "floor", parent: string | null) => ({
    id, household_id: HOUSEHOLD_ID, name, kind, parent_id: parent, sort_order: 0, created_at: "2026-10-01T00:00:00Z",
  });
  const rooms = [
    loc("00000000-0000-4000-8000-000000017201", "LT1", "floor", null),
    loc("00000000-0000-4000-8000-000000017202", "LT2", "floor", null),
    loc("00000000-0000-4000-8000-000000017203", "Dapur", "room", "00000000-0000-4000-8000-000000017201"),
  ];
  const chores = [
    {
      id: "00000000-0000-4000-8000-000000017211", household_id: HOUSEHOLD_ID, title: "Cuci piring", notes: null,
      category: "cleaning", assigned_to: null, due_date: today, due_time: null, status: "pending", completed_by: null,
      completed_at: null, photo_url: null, created_at: "2026-10-01T00:00:00Z", recurrence: "daily", recurrence_until: null,
      recurrence_interval: 1, remind_days_before: null, parent_task_id: null, requires_supervision: false,
      before_photo_url: null, after_photo_url: null, location_id: "00000000-0000-4000-8000-000000017203", spot: null,
    },
  ];
  await installStub(context, { owner: { locale: "en" }, rooms, chores });
  const calls = await answerSetup(context, ["Dapur"]);

  await page.goto("/dashboard?module=chores");
  await page.getByRole("button", { name: "Starter list" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Starter list" })).toBeVisible();
  // Their own kitchen and its dishes: Added, no checkbox.
  await expect(sheet.getByRole("checkbox", { name: "Cuci piring" })).toHaveCount(0);
  await expect(sheet.getByText("Cuci piring")).toBeVisible();
  await expect(sheet.getByText("Added").first()).toBeVisible();
  // Nothing starts ticked for an existing household.
  await expect(sheet.getByRole("button", { name: "Tick what to add" })).toBeDisabled();

  await sheet.getByRole("checkbox", { name: "Bersihkan kulkas" }).click();
  await sheet.getByRole("button", { name: "Add 1 chore" }).click();
  await expect(page.getByText("Added 1")).toBeVisible();

  const draft = calls.rpc.find((c) => c.name === "apply_household_setup")?.body.p_draft as Payload;
  expect(draft.chores.map((c) => c.title)).toEqual(["Bersihkan kulkas"]);
  expect(draft.chores[0].place).toBe("r:kitchen");
  // The kitchen is sent by name so the database maps the chore to theirs.
  expect(draft.rooms).toEqual([{ key: "r:kitchen", name: "Dapur", parent: "f:1" }]);
  expect(draft.staff).toEqual([]);
});

test("staff in one go: the link fills the code, Sari picks the name and makes a PIN", async ({ context, page }) => {
  await installStub(context, { stored: freshSession() });
  const claims: Record<string, unknown>[] = [];
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "house_code_roster") {
      expect(route.request().postDataJSON()).toEqual({ p_code: "K7P-M2Q" });
      return route.fulfill({
        json: [
          { id: "00000000-0000-4000-8000-00000000c101", name: "Ari", has_pin: true, claimable: false },
          { id: "00000000-0000-4000-8000-00000000c102", name: "Sari", has_pin: false, claimable: true },
          { id: "00000000-0000-4000-8000-00000000c103", name: "Budi", has_pin: false, claimable: false },
        ],
      });
    }
    if (name === "claim_staff_with_house_code") {
      claims.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "ok", household_id: HOUSEHOLD_ID } });
    }
    return route.fallback();
  });

  await page.goto("/join/code#c=K7P-M2Q&k=ABCDEFGHJK");
  // Straight to the names; both codes left the address bar.
  await expect(page.getByRole("heading", { name: "Siapa yang bertugas?" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Pilih nama Anda, lalu buat PIN.")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");

  // Budi was added weeks ago: told at once to ask for an invite link, no PIN typed.
  await page.getByRole("button", { name: /Budi/ }).click();
  await expect(page.getByText("Belum punya PIN. Minta link undangan", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Siapa yang bertugas?" })).toBeVisible();

  await page.getByRole("button", { name: /Sari/ }).click();
  await expect(page.getByText("Buat PIN", { exact: true })).toBeVisible();
  for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByText("Ulangi PIN")).toBeVisible();
  const linked = page.waitForURL(/\/staff/);
  for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await linked;
  expect(claims).toEqual([
    { p_code: "K7P-M2Q", p_staff_id: "00000000-0000-4000-8000-00000000c102", p_new_pin: "2468", p_claim: "ABCDEFGHJK" },
  ]);
});

test("the PINs must match before anything is sent", async ({ context, page }) => {
  await installStub(context, { stored: freshSession() });
  let claimed = 0;
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "house_code_roster") {
      return route.fulfill({ json: [{ id: "00000000-0000-4000-8000-00000000c102", name: "Sari", has_pin: false, claimable: true }] });
    }
    if (name === "claim_staff_with_house_code") claimed += 1;
    return route.fallback();
  });
  await page.goto("/join/code#c=K7PM2Q&k=ABCDEFGHJK");
  await page.getByRole("button", { name: /Sari/ }).click({ timeout: 20_000 });
  for (const d of "1111") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByText("Ulangi PIN")).toBeVisible();
  for (const d of "2222") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByText("PIN tidak sama. Buat PIN lagi.")).toBeVisible();
  await expect(page.getByText("Buat PIN")).toBeVisible();
  expect(claimed).toBe(0);
});

test("the house code alone can't claim a name: the link from the owner is needed (audit L5)", async ({ context, page }) => {
  await installStub(context, { stored: freshSession() });
  let claimed = 0;
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "house_code_roster") {
      return route.fulfill({ json: [{ id: "00000000-0000-4000-8000-00000000c102", name: "Sari", has_pin: false, claimable: true }] });
    }
    if (name === "claim_staff_with_house_code") claimed += 1;
    return route.fallback();
  });
  await page.goto("/join/code#c=K7PM2Q");
  // No promise of a PIN here (demo check F-3): the way to one is the owner's link.
  await expect(page.getByText("Belum punya PIN? Buka link dari WhatsApp pemilik rumah.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Pilih nama Anda, lalu buat PIN.")).toHaveCount(0);
  await expect(page.getByText("Buat PIN", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Sari/ }).click({ timeout: 20_000 });
  await expect(page.getByText("Buka link dari WhatsApp pemilik rumah untuk membuat PIN.")).toBeVisible();
  await expect(page.getByText("Ulangi PIN")).toHaveCount(0);
  expect(claimed).toBe(0);
});

test("Today: Sari's phone is linked, and the owner can say Not Sari? Undo (audit L5)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  const undone: Record<string, unknown>[] = [];
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "staff_claims_today") {
      return route.fulfill({
        json: undone.length ? [] : [{ staff_id: "00000000-0000-4000-8000-00000000c102", name: "Sari", claimed_at: new Date().toISOString() }],
      });
    }
    if (name === "undo_staff_claim") {
      undone.push(route.request().postDataJSON());
      return route.fulfill({ json: true });
    }
    return route.fallback();
  });
  await page.goto("/dashboard");
  await expect(page.getByText("Sari's phone is linked")).toBeVisible({ timeout: 20_000 });
  // Two taps: a brushed link never signs a phone out.
  await page.getByRole("button", { name: "Not Sari? Undo" }).click();
  expect(undone).toEqual([]);
  await page.getByRole("button", { name: "Tap again to undo" }).click();
  await expect(page.getByText("Sari's phone is removed.", { exact: false })).toBeVisible();
  await expect(page.getByText("Sari's phone is linked")).toHaveCount(0);
  expect(undone).toEqual([{ p_household: HOUSEHOLD_ID, p_staff_id: "00000000-0000-4000-8000-00000000c102" }]);
});

test("after archiving someone, the next WhatsApp message carries the new house code (Codex, PR #90)", async ({ context, page }) => {
  const now = new Date().toISOString();
  const staff: Record<string, unknown>[] = [
    { id: "00000000-0000-4000-8000-00000000c201", household_id: HOUSEHOLD_ID, name: "Sari", has_pin: false, user_id: null, archived_at: null, created_at: now },
    { id: "00000000-0000-4000-8000-00000000c202", household_id: HOUSEHOLD_ID, name: "Budi", has_pin: false, user_id: null, archived_at: null, created_at: now },
  ];
  await installStub(context, { owner: { locale: "en" }, staff });
  let code = "AAAAAA";
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "my_house_code") return route.fulfill({ json: code });
    if (name === "staff_claim_link") return route.fulfill({ json: "ABCDEFGHJK" });
    if (name === "archive_staff_profile") {
      // As 146 does: archived, and the house gets a new code.
      const budi = staff.find((p) => p.name === "Budi")!;
      budi.archived_at = new Date().toISOString();
      code = "BBBBBB";
      return route.fulfill({ json: budi });
    }
    return route.fallback();
  });
  await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));

  await page.goto("/dashboard?module=access&page=staff");
  const send = page.getByRole("button", { name: "Send one WhatsApp message" });
  await expect(send).toBeEnabled({ timeout: 20_000 });

  await page.getByRole("button", { name: "Remove Budi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Budi removed.", { exact: false })).toBeVisible();

  await expect(send).toBeEnabled();
  const popup = page.waitForEvent("popup");
  await send.click();
  const wa = await popup;
  const text = new URL(wa.url()).searchParams.get("text") ?? "";
  await wa.close();
  expect(text).toContain("#c=BBB-BBB&k=ABCDEFGHJK");
});
