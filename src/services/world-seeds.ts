import { type WorldSeedPreset, WorldSeedPresetListSchema } from "../domain";

const worldSeedPresets = [
  {
    id: "isekai",
    name: "异世界",
    description: "召唤、转生、冒险者公会、魔法、魔王和技能系统。",
    genreTags: ["召唤", "转生", "魔法", "冒险"],
    defaultTone: "heroic",
    generationPrompt:
      "生成一段异世界冒险，强调明确成长线、具体开局目标和可完成的主线冲突。避免一开始塞入过多数值面板。"
  },
  {
    id: "medieval",
    name: "中古世界",
    description: "王国、骑士、教会、商会、边境战争和贵族阴谋。",
    genreTags: ["王国", "骑士", "教会", "边境"],
    defaultTone: "serious",
    generationPrompt:
      "生成一段中古世界冒险，强调政治关系、社会阶层、旅途和资源压力。魔法浓度由 fantasyLevel 控制。"
  },
  {
    id: "ancient-china",
    name: "古代中国",
    description: "王朝、江湖、门派、朝堂、边塞、志怪和商旅。",
    genreTags: ["王朝", "江湖", "门派", "志怪"],
    defaultTone: "mystery",
    generationPrompt:
      "生成一段架空古代中国冒险，强调身份、礼法、势力、人情和地方秩序。避免把不同朝代元素无意义堆叠。"
  },
  {
    id: "sengoku-japan",
    name: "日本战国",
    description: "大名、武士、忍者、城池、合战、商人和妖怪传说。",
    genreTags: ["大名", "武士", "忍者", "合战"],
    defaultTone: "dark",
    generationPrompt:
      "生成一段架空日本战国冒险，强调阵营选择、战争压力、忠诚与背叛。使用虚构藩国和人物。"
  }
] satisfies WorldSeedPreset[];

export function listWorldSeedPresets(): readonly WorldSeedPreset[] {
  return WorldSeedPresetListSchema.parse(worldSeedPresets);
}
