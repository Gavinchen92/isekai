import { describe, expect, it } from "vitest";
import { PlayerInputIntentSchema, SuggestedMoveSchema, isResultClaim } from "./runtime";

const baseMove = {
  id: "move-1",
  sessionId: "session-1",
  sourceMessageId: "message-1",
  label: "试图说服守卫放我进城",
  intent: "玩家尝试通过交涉进入城门",
  riskLevel: "medium",
  tags: ["交涉"],
  createdAt: "2026-04-27T00:00:00.000Z"
} as const;

describe("PlayerInputIntentSchema", () => {
  it("includes world override attempts", () => {
    expect(PlayerInputIntentSchema.parse("world_override_attempt")).toBe("world_override_attempt");
  });
});

describe("SuggestedMoveSchema", () => {
  it("accepts attempted actions", () => {
    expect(SuggestedMoveSchema.parse(baseMove).label).toBe("试图说服守卫放我进城");
  });

  it("rejects successful outcome claims", () => {
    const result = SuggestedMoveSchema.safeParse({
      ...baseMove,
      label: "成功说服守卫放我进城"
    });

    expect(result.success).toBe(false);
  });
});

describe("isResultClaim", () => {
  it("allows dangerous attempts but rejects declared outcomes", () => {
    expect(isResultClaim("试图杀死黑骑士")).toBe(false);
    expect(isResultClaim("玩家尝试杀死黑骑士")).toBe(false);
    expect(isResultClaim("杀死黑骑士")).toBe(true);
  });
});
