import { describe, expect, it } from "vitest";
import { feedbackErrorKind, feedbackPage } from "@/lib/feedback";

describe("feedbackPage", () => {
  it("keeps the path and the app's own view parameters", () => {
    expect(feedbackPage("/dashboard", "?tab=staff&view=rooms")).toBe("/dashboard?tab=staff&view=rooms");
    expect(feedbackPage("/staff", "")).toBe("/staff");
  });

  it("drops anything a link might carry", () => {
    expect(feedbackPage("/dashboard", "?tab=staff&token=secret&email=a%40b.c")).toBe("/dashboard?tab=staff");
    expect(feedbackPage("/join", "?token=abc")).toBe("/join");
  });

  it("stays short", () => {
    expect(feedbackPage("/" + "a".repeat(300), "").length).toBe(200);
    expect(feedbackPage("/dashboard", `?tab=${"x".repeat(100)}`)).toBe(`/dashboard?tab=${"x".repeat(40)}`);
  });
});

describe("feedbackErrorKind", () => {
  it("reads the database's refusals", () => {
    expect(feedbackErrorKind({ message: "feedback_daily_limit" })).toBe("too_many");
    expect(feedbackErrorKind({ message: "feedback_not_this_staff" })).toBe("who");
    expect(feedbackErrorKind({ message: "feedback_staff_required" })).toBe("who");
  });

  it("treats anything else as a failed send", () => {
    expect(feedbackErrorKind(new TypeError("Failed to fetch"))).toBe("failed");
    expect(feedbackErrorKind(null)).toBe("failed");
  });
});
