import { describe, expect, it } from "vitest";
import { VOTE_CONFLICT_MESSAGE } from "./voting";

describe("VOTE_CONFLICT_MESSAGE", () => {
  it("asks the user to retry rather than reporting a server error", () => {
    expect(VOTE_CONFLICT_MESSAGE).toMatch(/try again/i);
  });

  it("does not leak Prisma error codes or internals", () => {
    expect(VOTE_CONFLICT_MESSAGE).not.toMatch(/P20\d\d|Prisma|transaction/i);
  });
});