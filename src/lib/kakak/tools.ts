import type Anthropic from "@anthropic-ai/sdk";

// The five tools Kakak gets (docs/phase-156-step2-kakak-plan.md, section 3).
// The list is identical for every household so it caches once for everyone:
// names of people, pets and rooms never appear here, only short references
// (S1, P1, R1, I1, M1) that the household block defines.
//
// strict: true guarantees the shape. Strict schemas can't express lengths or
// patterns, so those are checked after the call (validate.ts).

const nullableString = (description: string) => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  description,
});

export const KAKAK_TOOL_NAMES = [
  "create_chore",
  "add_to_shopping_list",
  "add_pet_routine",
  "add_food",
  "ask_question",
] as const;

export type KakakToolName = (typeof KAKAK_TOOL_NAMES)[number];

export const KAKAK_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_chore",
    description:
      "Suggest one household chore for the owner to confirm. One call per chore; 'Monday and Thursday' is two calls. Never saves anything.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "title_en",
        "category",
        "assignee",
        "due_date",
        "due_time",
        "recurrence",
        "recurrence_until",
        "requires_supervision",
        "room",
        "new_room_name",
        "new_room_floor",
        "notes",
      ],
      properties: {
        title: {
          type: "string",
          description: "Short, in Bahasa Indonesia, as staff will read it: 'Pel teras'. Max 80 characters.",
        },
        title_en: nullableString("English gloss for an English-speaking owner, else null."),
        category: { type: "string", enum: ["cleaning", "maintenance", "errand", "groceries"] },
        assignee: nullableString("A person reference (S1, S2, … or M1 for the owner). Null means anyone."),
        due_date: {
          type: "string",
          format: "date",
          description: "First (or only) day, YYYY-MM-DD, Asia/Jakarta.",
        },
        due_time: nullableString("HH:mm, 24-hour, or null for 'sometime that day'."),
        recurrence: {
          type: "string",
          enum: ["none", "daily", "weekly", "monthly"],
          description: "Weekly repeats on due_date's weekday; monthly on its day of the month.",
        },
        recurrence_until: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
        requires_supervision: {
          type: "boolean",
          description: "True only if the owner said they must be there.",
        },
        room: nullableString("A room reference (R1, …) or null."),
        new_room_name: nullableString(
          "Only after the owner agreed to add a new room; room must then be null.",
        ),
        new_room_floor: nullableString(
          "With new_room_name only: the floor it is on, as a reference marked (whole floor), or null.",
        ),
        notes: nullableString("Max 200 characters."),
      },
    },
  },
  {
    name: "add_to_shopping_list",
    description:
      "Suggest things to buy. Match an existing shopping item when the owner clearly means it; otherwise write a short new note. Never saves anything.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          description: "1 to 10 things.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "status", "note", "pet"],
            properties: {
              item: nullableString(
                "An existing shopping item reference (I1, …), or null for a new note.",
              ),
              status: {
                type: "string",
                enum: ["low", "out"],
                description: "'low' for running low, 'out' for none left or just 'buy'.",
              },
              note: nullableString(
                "For a new note: what to buy, in Bahasa Indonesia, with an amount if given ('Gula 2 kg'). Max 120 characters. Null when item is set.",
              ),
              pet: nullableString("A pet reference when the new note is for one pet, else null."),
            },
          },
        },
      },
    },
  },
  {
    name: "add_pet_routine",
    description:
      "Suggest daily meal or potty times for one pet. Only meals and potty breaks; medicine, grooming and vet visits are done on the Pets tab. Never saves anything.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["pet", "kind", "times", "label"],
      properties: {
        pet: { type: "string", description: "A pet reference (P1, …). For 'the dogs', one call per pet." },
        kind: { type: "string", enum: ["meal", "potty"] },
        times: {
          type: "array",
          items: { type: "string" },
          description: "1 to 12 times, HH:mm, 24-hour, each a new time (not one the pet already has).",
        },
        label: nullableString(
          "Meals only, optional, Indonesian ('Sarapan'). Null to use the app's default.",
        ),
      },
    },
  },
  {
    name: "add_food",
    description:
      "Suggest one food in the house (a gift, leftovers, something bought). If no date was given, ask first; you may offer a cautious guess as one answer. Never saves anything.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "kept_in",
        "expires_on",
        "expiry_unknown",
        "expiry_is_guess",
        "source",
        "from_whom",
        "return_container",
        "notes",
      ],
      properties: {
        name: { type: "string", description: "As the owner said it ('Lapis legit'). Max 80 characters." },
        kept_in: { type: "string", enum: ["fridge", "freezer", "pantry", "counter"] },
        expires_on: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
        expiry_unknown: {
          type: "boolean",
          description: "True when the owner answered 'don't know'; expires_on is then null.",
        },
        expiry_is_guess: {
          type: "boolean",
          description: "True when expires_on is Kakak's cautious guess, not a label or the owner's date.",
        },
        source: { anyOf: [{ type: "string", enum: ["home", "gift", "bought"] }, { type: "null" }] },
        from_whom: nullableString("Only for gifts. Max 60 characters."),
        return_container: {
          type: "boolean",
          description: "True when the container goes back to the giver.",
        },
        notes: nullableString("Max 200 characters."),
      },
    },
  },
  {
    name: "ask_question",
    description:
      "Ask the owner one short question when something needed is missing or unclear. Offer 2 to 4 short answers. Only one question per turn.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["question", "answers", "allow_typing"],
      properties: {
        question: {
          type: "string",
          description: "In the owner's language, one sentence, max 100 characters.",
        },
        answers: {
          type: "array",
          items: { type: "string" },
          description: "2 to 4 answers, each max 24 characters, in the owner's language.",
        },
        allow_typing: { type: "boolean", description: "Show 'Or type an answer'." },
      },
    },
  },
];
