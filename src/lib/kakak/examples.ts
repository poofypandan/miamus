// The tappable examples on the Kakak sheet's first screen (plan, screen 2).
// They teach what Kakak can do without a help page, so each one is something
// her tools really do — a chore, a reminder for the owner, shopping, a pet's
// meals, food in the fridge — never a question she can't answer yet ("who's
// on leave?"). They use this household's own first names, so a tapped
// example works as it is: Kakak never has to say "I can't find Sari".
// Each also works in practice mode (lib/kakak/practice.ts).
//
// Pure, so the wording is unit-tested in both languages.

export type KakakExampleKind = "chore" | "reminder" | "shopping" | "pet" | "food" | "sheets";

export interface KakakExample {
  kind: KakakExampleKind;
  text: string;
}

export interface ExampleHousehold {
  locale: "en" | "id";
  /** Active staff who sign in by PIN (not admins), oldest first. */
  staffNames: string[];
  /** Live pets, oldest first; empty when the household said it has no pets. */
  petNames: string[];
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** A usable first name: letters only, short, or null. */
function cleanName(name: string | undefined): string | null {
  if (!name) return null;
  const first = firstName(name).replace(/[^\p{L}'-]/gu, "");
  return first.length >= 2 && first.length <= 20 ? first : null;
}

export function kakakExamples({ locale, staffNames, petNames }: ExampleHousehold): KakakExample[] {
  const staff = cleanName(staffNames[0]);
  const pet = cleanName(petNames[0]);
  const id = locale === "id";
  const list: KakakExample[] = [];

  list.push({
    kind: "chore",
    text: id
      ? staff
        ? `${staff} siram tanaman setiap Senin jam 8`
        : "Siram tanaman setiap Senin jam 8"
      : staff
        ? `${staff} waters the plants every Monday at 8`
        : "Water the plants every Monday at 8",
  });
  list.push({
    kind: "shopping",
    text: id ? "Beli beras dan telur" : "Buy rice and eggs",
  });
  list.push({
    kind: "reminder",
    text: id
      ? "Ingatkan saya bersihkan filter AC besok jam 7 malam"
      : "Remind me to clean the AC filter tomorrow at 7 pm",
  });
  if (pet) {
    list.push({
      kind: "pet",
      text: id ? `${pet} makan jam 7 pagi dan jam 5 sore` : `Feed ${pet} at 7 am and 5 pm`,
    });
  } else {
    list.push({
      kind: "sheets",
      text: id ? "Ganti seprai setiap Sabtu" : "Change the bed sheets every Saturday",
    });
  }
  list.push({
    kind: "food",
    text: id ? "Rendang dari Tante Rina di kulkas" : "Rendang from Aunt Rina in the fridge",
  });
  return list;
}
