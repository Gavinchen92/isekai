import type { JourneyMemoryEntryType, Session } from "../domain";
import type { TurnStage } from "./types";

export const turnStageLabels: Record<TurnStage, string> = {
  classifying: "正在理解你的行动意图…",
  generating: "正在生成故事与局势变化…",
  finalizing: "正在整理推荐行动…"
};

export const journeyMemoryTabs: ReadonlyArray<{
  label: string;
  type: JourneyMemoryEntryType;
}> = [
  { label: "身份", type: "identity" },
  { label: "人物", type: "npc" },
  { label: "地点", type: "location" },
  { label: "关系", type: "relationship" },
  { label: "线索", type: "clue" },
  { label: "物件", type: "item" }
];

export const journeyMemoryTypeLabels: Record<JourneyMemoryEntryType, string> = {
  identity: "身份",
  npc: "人物",
  location: "地点",
  relationship: "关系",
  clue: "线索",
  item: "物件"
};

export const storyActLabels: Record<Session["currentAct"], string> = {
  act1: "第一幕",
  act2: "第二幕",
  act3: "第三幕",
  act4: "第四幕",
  ending: "终章",
  epilogue: "尾声"
};
