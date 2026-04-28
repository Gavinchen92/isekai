import { describe, expect, it } from "vitest";
import { WorldSeedPresetListSchema } from "../domain";
import { listWorldSeedPresets } from "./world-seeds";

describe("listWorldSeedPresets", () => {
  it("returns four schema-valid built-in seeds", () => {
    const seeds = WorldSeedPresetListSchema.parse(listWorldSeedPresets());

    expect(seeds).toHaveLength(4);
    expect(seeds.map((seed) => seed.name)).toEqual([
      "异世界",
      "中古世界",
      "古代中国",
      "日本战国"
    ]);
  });
});
