import { describe, expect, it } from "vitest";
import { GmSuggestedMoveDraftSchema, GmTurnResultSchema } from "./gm";

describe("GmSuggestedMoveDraftSchema", () => {
  it("accepts moves that describe attempts", () => {
    expect(
      GmSuggestedMoveDraftSchema.parse({
        label: "尝试说服守卫让路",
        intent: "玩家尝试通过交谈获得通行机会",
        tags: ["交涉"]
      }).label
    ).toBe("尝试说服守卫让路");
  });

  it("rejects moves that declare successful outcomes", () => {
    expect(() =>
      GmSuggestedMoveDraftSchema.parse({
        label: "成功说服守卫让路",
        intent: "玩家已经获得通行权",
        tags: ["交涉"]
      })
    ).toThrow(/attempts/u);
  });
});

describe("GmTurnResultSchema", () => {
  it("keeps player-visible output separate from GM internal state", () => {
    const result = GmTurnResultSchema.parse({
      narration: "你在塔底发现被刻意掩盖的脚印。",
      suggestedMoves: [
        {
          label: "继续检查脚印",
          intent: "玩家尝试确认脚印通向哪里",
          tags: ["调查"]
        }
      ],
      journeyMemoryCandidates: [
        {
          key: "tower",
          type: "clue",
          title: "塔底脚印",
          summary: "塔底出现了被刻意掩盖的脚印。",
          details: ["脚印通向塔内深处。"],
          visibility: "known",
          confidence: "high",
          relatedNpcIds: [],
          relatedLocationIds: ["tower"]
        }
      ],
      internalStatePatch: {
        flags: ["saw-footprints"],
        privateNotes: ["真正留下脚印的是守塔人。"]
      }
    });

    expect(result.narration).not.toContain("守塔人");
    expect(result.internalStatePatch.privateNotes).toContain("真正留下脚印的是守塔人。");
  });
});
