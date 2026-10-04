import { expect, it } from "vitest";
import { isSingleQuestion } from "../../server/taskPlan.js";

it('keeps a name-only conversational follow-up on the brief question path', () => {
  expect(isSingleQuestion('What is my verification project named? Reply with only the name.')).toBe(true);
});

it("keeps arithmetic questions with a reply-format suffix on the direct answer path", () => {
  expect(isSingleQuestion("What is 1 + 1? Reply with only the number.")).toBe(true);
  expect(isSingleQuestion("What is 3 + 3?")).toBe(true);
  expect(isSingleQuestion("Who wrote it? Answer in one sentence.")).toBe(true);
});
it("retains planning for additional work and multiple questions", () => {
  expect(isSingleQuestion("What is 1 + 1? Then create a report and save it.")).toBe(false);
  expect(isSingleQuestion("What is 1 + 1? What is 2 + 2?")).toBe(false);
  expect(isSingleQuestion("Research this and build an app")).toBe(false);
  expect(isSingleQuestion("A".repeat(500) + "?")).toBe(false);
});
