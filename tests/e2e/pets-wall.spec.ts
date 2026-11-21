import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID, SCHEDULES } from "../fixtures/household";
import { installStub, type Stub } from "./stub-backend";

// The Pets tab as a wall (21 Nov; Fable's 08, section 5, decisions 19–35):
// every pet the same size, bands up to three, two by two from four; the
// name and one quiet line on each tile, the breed or, in amber with its
// mark, a routine that is late (Today's rule); a tap opens the pet's page,
// which leads with its photo. The stub's household has Mochi and Bento.

const SEEN = ["pets-wall-2026-11"];

function addPet(stub: Stub, name: string, metadata: Record<string, unknown> = {}) {
  stub.entities.push({
    id: `00000000-0000-4000-8000-0000000003${String(stub.entities.length).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    entity_type: "pet",
    name,
    icon: "dog",
    metadata,
    status: "home",
    created_at: "2026-10-01T03:00:00Z",
  });
}

async function openPets(page: Page) {
  await page.goto("/dashboard?module=pets");
  const wall = page.getByRole("list", { name: "Your pets" });
  await expect(wall).toBeVisible({ timeout: 20_000 });
  return wall;
}

async function boxes(page: Page) {
  const tiles = page.getByRole("list", { name: "Your pets" }).getByRole("listitem");
  const out = [];
  for (let i = 0; i < (await tiles.count()); i++) out.push((await tiles.nth(i).boundingBox())!);
  return out;
}

test.beforeEach(async ({ context, page }) => {
  // 05:30 in Jakarta: nothing of the stub's day is due yet, so each tile shows its facts.
  await page.clock.setFixedTime(new Date("2026-11-21T05:30:00+07:00"));
  await context.addInitScript((cards) => {
    for (const card of cards) localStorage.setItem(`miamus.whats-new.${card}`, "seen");
  }, SEEN);
});

test("two pets are two bands, each the full width; a tap opens the pet's page", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  stub.entities[0].metadata = { breed: "Toy poodle" };
  const wall = await openPets(page);

  const [a, b] = await boxes(page);
  expect(Math.round(a.width)).toBe(Math.round(b.width));
  expect(Math.round(a.height)).toBe(Math.round(b.height));
  expect(b.y).toBeGreaterThan(a.y + a.height - 1);
  // No date, no progress list: the day belongs to the pet's page and to Today.
  await expect(page.getByLabel("Jump to date")).toHaveCount(0);

  // The breed on the tile; with nothing known, no line, and paper with the initial.
  await expect(wall.getByRole("button", { name: "Mochi. Toy poodle." })).toBeVisible();
  const bento = wall.getByRole("button", { name: "Bento", exact: true });
  await expect(bento).toContainText("Add a photo");

  await wall.getByRole("button", { name: "Mochi. Toy poodle." }).click();
  const page_ = page.getByRole("dialog", { name: "Mochi" });
  await expect(page_.getByRole("heading", { name: "Mochi" })).toBeVisible();
  await expect(page_.getByText("Toy poodle")).toBeVisible();
  await expect(page_.getByRole("heading", { name: "Health record" })).toBeVisible();
});

test("four pets are two by two, every one the same size; three are three bands", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  addPet(stub, "Coco");
  await openPets(page);
  const three = await boxes(page);
  expect(three).toHaveLength(3);
  expect(new Set(three.map((box) => Math.round(box.x))).size).toBe(1);

  addPet(stub, "Kopi");
  await page.reload();
  await openPets(page);
  const four = await boxes(page);
  expect(four).toHaveLength(4);
  expect(new Set(four.map((box) => Math.round(box.width))).size).toBe(1);
  expect(new Set(four.map((box) => Math.round(box.height))).size).toBe(1);
  expect(Math.round(four[0].y)).toBe(Math.round(four[1].y));
  expect(four[2].y).toBeGreaterThan(four[0].y);
});

test("a late routine turns the line amber with its mark, by Today's rule", async ({ context, page }) => {
  // 08:30: the 07:00 potty break is more than an hour past its time and not done.
  await page.clock.setFixedTime(new Date("2026-11-21T08:30:00+07:00"));
  const stub = await installStub(context, { owner: { locale: "en" } });
  stub.entities[0].metadata = { breed: "Toy poodle" };
  const wall = await openPets(page);
  await expect(wall.getByRole("button", { name: /^Mochi\. Late: / })).toBeVisible();
  // The facts give way: never two lines under a name.
  await expect(wall.getByRole("button", { name: /^Mochi/ })).not.toContainText("Toy poodle");
});

test("a routine staff said couldn't be done is explained, never late (Codex, PR #197)", async ({ context, page }) => {
  await page.clock.setFixedTime(new Date("2026-11-21T08:30:00+07:00"));
  const potty = SCHEDULES.find((s) => s.entity_id === "00000000-0000-4000-8000-0000000000a1" && s.title === "Pipis & Pup")!;
  const stub = await installStub(context, {
    owner: { locale: "en" },
    exceptions: [
      {
        id: "00000000-0000-4000-8000-000000197001",
        household_id: HOUSEHOLD_ID,
        chore_id: null,
        schedule_id: potty.id,
        entity_id: potty.entity_id,
        occurs_on: "2026-11-21",
        slot_time: "07:00:00",
        reason: "other",
        note: null,
        photo_url: null,
        inventory_item_id: null,
        staff_id: null,
        created_at: "2026-11-21T00:10:00Z",
      },
    ],
  });
  stub.entities[0].metadata = { breed: "Toy poodle" };
  const wall = await openPets(page);
  // The 07:00 potty break is explained, and the 08:00 medicine is inside its hour: no amber.
  await expect(wall.getByRole("button", { name: "Mochi. Toy poodle." })).toBeVisible();
});

test("on the first visit, What's new is one quiet line and the wall keeps its full size (Fable's look, #197)", async ({
  context,
  page,
}) => {
  // The card not yet seen on this phone (beforeEach marked it seen).
  await context.addInitScript(() => localStorage.removeItem("miamus.whats-new.pets-wall-2026-11"));
  await page.setViewportSize({ width: 390, height: 844 });
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  addPet(stub, "Coco");
  await openPets(page);
  const line = page.getByRole("button", { name: "New: all your pets at once" });
  await expect(line).toBeVisible();
  await expect(page.getByRole("region", { name: "New: all your pets at once" })).toHaveCount(0);
  // Every tile whole, above Kakak's band.
  const band = await page.getByTestId("kakak-band").boundingBox();
  for (const box of await boxes(page)) expect(box.y + box.height).toBeLessThanOrEqual(band!.y);
  await line.click();
  const sheet = page.getByRole("dialog", { name: "New: all your pets at once" });
  await expect(sheet.getByText(/every pet at once/)).toBeVisible();
  await sheet.getByRole("button", { name: "Got it" }).click();
  await expect(line).toHaveCount(0);
});

test("in Bahasa Indonesia, and a pet at the clinic says so quietly", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" } });
  stub.entities[1].status = "admitted";
  await page.goto("/dashboard?module=pets");
  const wall = page.getByRole("list", { name: "Hewan Anda" });
  await expect(wall).toBeVisible({ timeout: 20_000 });
  await expect(wall.getByRole("button", { name: "Bento. Di klinik." })).toBeVisible();
  await expect(wall.getByRole("button", { name: "Mochi", exact: true })).toContainText("Tambah foto");
});
