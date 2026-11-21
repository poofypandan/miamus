import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Recipe ideas and the household's food preferences (PR C2, migrations/183).
// /api/kakak is answered here, in the browser, so no key and no Anthropic
// call: what is under test is the phone's side. The food-rules card is the
// app's own (D2): the tap is the consent and saves it, with Undo, unless
// Remember for next time is off; either way the answer goes to Kakak. A
// recipe idea saves through the owner's own save_recipe. The owner changes
// the preferences on Kitchen notes; staff read them there.
// SHOTS_DIR set: the PR's screenshots are saved there too.

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

const IDEAS_EN = "Idea: Vegetable curry (Sayur lodeh), uses Santan; still needs Tempe.\nWant me to save one as a recipe?";

/** The first turn is the food-rules card; every later turn is the ideas. */
async function answerKakak(page: Page, locale: "en" | "id") {
  const asked: { reply: string; v: number }[] = [];
  await page.route("**/api/kakak", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    if (asked.length === 1) {
      return route.fulfill({
        json: {
          kind: "question",
          question: locale === "id" ? "Ada aturan makanan untuk ide masak?" : "Any food rules for recipe ideas?",
          answers: locale === "id" ? ["Halal", "Halal, tanpa alkohol", "Tidak ada"] : ["Halal", "Halal, no alcohol", "No rules"],
          allowTyping: true,
          foodRules: true,
          requestId: "00000000-0000-4000-8000-0000000000c1",
          history: {
            messages: [
              { role: "user", content: body.reply },
              { role: "assistant", content: [{ type: "tool_use", id: "toolu_rules", name: "ask_food_preferences", input: { for: "ideas" } }] },
            ],
          },
        },
      });
    }
    return route.fulfill({
      json: { kind: "message", text: IDEAS_EN, requestId: "00000000-0000-4000-8000-0000000000c2", history: { messages: [] } },
    });
  });
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  return asked;
}

async function askForIdeas(page: Page, words = "Any recipe ideas?") {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Tell Kakak|Bilang ke Kakak/ }).click({ timeout: 20_000 });
  await page.getByRole("textbox").first().fill(words);
  await page.getByRole("button", { name: /^(Send|Kirim)$/ }).click();
}

test("the food-rules card: a tap saves it, says so with Undo, and the answer goes to Kakak", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const asked = await answerKakak(page, "en");
  await askForIdeas(page);

  const card = page.getByTestId("kakak-food-rules");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Any food rules for recipe ideas?");
  for (const answer of ["Halal", "Halal, no alcohol", "No rules", "More"]) {
    await expect(card.getByRole("button", { name: answer, exact: true })).toBeVisible();
  }
  await expect(card.getByRole("switch", { name: "Remember for next time" })).toHaveAttribute("aria-checked", "true");
  await shot(page, "kakak-food-rules-card");

  await card.getByRole("button", { name: "Halal, no alcohol", exact: true }).click();
  await expect.poll(() => stub.kitchen.foodRules).toEqual(["halal", "no_alcohol"]);
  const saved = page.getByTestId("kakak-food-rules-saved");
  await expect(saved).toContainText("Saved. Change it in Kitchen notes.");
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].reply).toBe("Halal · No alcohol. (Saved for next time.)");
  expect(asked[1].v).toBe(6);
  await expect(page.getByText("Idea: Vegetable curry (Sayur lodeh)")).toBeVisible();
  await shot(page, "kakak-ideas-reply");

  // Undo, in the sheet (the conversation goes on), puts back "not asked yet".
  await saved.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.kitchen.foodRules).toBeNull();
  await expect(saved).toContainText("Undone. Kakak will ask again next time.");
});

test("Remember off saves nothing; More picks any of the four (Indonesian)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  const asked = await answerKakak(page, "id");
  await askForIdeas(page, "Ada ide masak apa?");

  const card = page.getByTestId("kakak-food-rules");
  await expect(card).toContainText("Ada aturan makanan untuk ide masak?");
  await card.getByRole("switch", { name: "Ingat untuk berikutnya" }).click();
  await card.getByRole("button", { name: "Lainnya", exact: true }).click();
  await card.getByRole("button", { name: "Tanpa daging sapi" }).click();
  await card.getByRole("button", { name: "Vegetarian" }).click();
  await expect(card.getByRole("button", { name: "Vegetarian" })).toHaveAttribute("aria-pressed", "true");
  await shot(page, "kakak-food-rules-more");
  await card.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].reply).toBe("Tanpa daging sapi · Vegetarian. (Hanya untuk percakapan ini.)");
  expect(stub.kitchen.foodRules).toBeNull();
  expect(stub.writes.some(([, table]) => table === "rpc/set_food_preferences")).toBe(false);
});

test("a recipe idea saves as a recipe with names only, and Undo deletes it", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true }, recipes: [] });
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: {
        kind: "suggestions",
        text: "Of course. Here it is to save.",
        items: [
          {
            kind: "recipe_idea",
            name: "Sayur lodeh",
            nameEn: "Vegetable curry",
            ingredients: [
              { itemId: null, name: "Santan" },
              { itemId: null, name: "Tempe" },
            ],
            servings: 4,
          },
        ],
        requestId: "00000000-0000-4000-8000-0000000000c3",
        history: { messages: [] },
      },
    }),
  );
  await askForIdeas(page, "Save the first one");
  await expect(page.getByText("Recipe idea", { exact: true })).toBeVisible();
  await expect(page.getByText("Vegetable curry (Sayur lodeh)")).toBeVisible();
  await expect(page.getByText("Kakak's idea. Add the amounts and steps yourself.")).toBeVisible();
  await shot(page, "kakak-recipe-idea-card");
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.recipes.length).toBe(1);
  const saved = stub.recipes[0] as { name: string; name_id: string | null; written_in: string; steps: string | null; ingredients: { name: string; amount: unknown }[] };
  expect(saved).toMatchObject({ name: "Vegetable curry", name_id: "Sayur lodeh", written_in: "en", steps: null });
  expect(saved.ingredients.map((line) => [line.name, line.amount])).toEqual([
    ["Santan", null],
    ["Tempe", null],
  ]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.recipes.length).toBe(0);
});

test("the owner sets the food preferences on Kitchen notes, one tap each", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true } });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: /Add a note for whoever cooks/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  const group = sheet.getByRole("group", { name: "Food preferences" });
  await expect(group).toBeVisible();
  await expect(sheet.getByText(/Shown to whoever cooks, and used for Kakak.s recipe ideas/)).toBeVisible();
  await group.getByRole("button", { name: "Halal" }).click();
  await expect.poll(() => stub.kitchen.foodRules).toEqual(["halal"]);
  await group.getByRole("button", { name: "No alcohol" }).click();
  await expect.poll(() => stub.kitchen.foodRules).toEqual(["halal", "no_alcohol"]);
  await expect(group.getByRole("button", { name: "No alcohol" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("Allergies go in the note below.", { exact: false })).toBeVisible();
  await shot(page, "kitchen-notes-food-preferences");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("food-rules-line")).toContainText("Food preferences: Halal · No alcohol");
  // No rules is an answer too, and the line goes.
  await page.getByRole("button", { name: /Kitchen notes/ }).click();
  await page.getByRole("group", { name: "Food preferences" }).getByRole("button", { name: "No rules" }).click();
  await expect.poll(() => stub.kitchen.foodRules).toEqual([]);
});

test("a staff phone reads the food preferences beside the kitchen notes, and can't change them", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    kitchenNotes: "Jangan terlalu pedas.",
    foodRules: ["halal", "no_alcohol"],
    menu: [
      {
        id: "00000000-0000-4000-8000-000000017601",
        household_id: HOUSEHOLD_ID,
        day: today(),
        meal: "dinner",
        recipe_id: null,
        title: "Nasi goreng",
        servings: null,
        notes: null,
        position: 0,
        cooked_at: null,
        cooked_by: null,
        cooked_uses: null,
        created_by: null,
        created_at: "2026-11-10T00:00:00Z",
        updated_at: "2026-11-10T00:00:00Z",
      },
    ],
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Catatan dapur: Jangan terlalu pedas.");
  await expect(card).toContainText("Preferensi makanan: Halal · Tanpa alkohol");
  await expect(card.getByRole("group", { name: "Preferensi makanan" })).toHaveCount(0);
  await shot(page, "staff-menu-food-preferences");
});
