import type {
  Adventure,
  JourneyMemoryEntry,
  SessionSnapshot,
  WorldSeedId,
  WorldSeedPreset
} from "../domain";
import { ApiRequestError } from "./api";
import type { MoveOption, UserErrorCopy, WorldSeedsState } from "./types";

export function getUserFacingErrorMessage(error: unknown, copy: UserErrorCopy): string {
  if (isLikelyUpstreamFailure(error) && copy.upstream) {
    return copy.upstream;
  }

  return copy.fallback;
}

function isLikelyUpstreamFailure(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.status === 502 || error.status === 503 || error.status === 504;
  }

  return false;
}

export function confirmDeleteSavedSession(adventureTitle: string): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return false;
  }

  return window.confirm(`确定删除「${adventureTitle}」的冒险存档吗？此操作不可恢复。`);
}

export function getAssistantMessageCount(snapshot: SessionSnapshot): number {
  return snapshot.messages.filter((message) => message.role === "assistant").length;
}

export function formatSavedSessionTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function buildInitialSuggestedMoves(adventure: Adventure): readonly MoveOption[] {
  const firstNpc = adventure.npcSeeds[0]?.name;
  const firstLocation = adventure.locations[0]?.name;

  return [
    {
      id: "initial-talk",
      label: firstNpc ? `尝试向 ${firstNpc} 打探局势` : "尝试寻找愿意交谈的人",
      intent: firstNpc ? `尝试向 ${firstNpc} 打探局势` : "尝试寻找愿意交谈的人"
    },
    {
      id: "initial-investigate",
      label: firstLocation ? `谨慎调查 ${firstLocation}` : "谨慎观察周围环境",
      intent: firstLocation ? `谨慎调查 ${firstLocation}` : "谨慎观察周围环境"
    },
    {
      id: "initial-plan",
      label: "整理眼前线索，制定下一步计划",
      intent: "玩家尝试整理眼前线索，再决定推进方向"
    }
  ];
}

export function buildJourneyMemorySummaryEntries(
  entries: readonly JourneyMemoryEntry[]
): readonly JourneyMemoryEntry[] {
  const identityEntries = entries.filter((entry) => entry.type === "identity").slice(0, 1);
  const otherEntries = [...entries]
    .filter((entry) => entry.type !== "identity")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return [...identityEntries, ...otherEntries].slice(0, 5);
}

export function getLatestJourneyMemoryUpdatedAt(entries: readonly JourneyMemoryEntry[]): string {
  return entries.reduce(
    (latest, entry) => (entry.updatedAt > latest ? entry.updatedAt : latest),
    ""
  );
}

export function formatJourneyMemoryTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function findWorldSeed(
  worldSeedsState: WorldSeedsState,
  seedId: WorldSeedId
): WorldSeedPreset | undefined {
  if (worldSeedsState.status !== "success") {
    return undefined;
  }

  return worldSeedsState.seeds.find((seed) => seed.id === seedId);
}

export function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name: unknown }).name === "AbortError"
  );
}

export function syncScrollPageToTop(): (() => void) | undefined {
  if (typeof window === "undefined" || typeof window.scrollTo !== "function") {
    return undefined;
  }

  if (window.navigator.userAgent.includes("jsdom")) {
    return undefined;
  }

  forceScrollToTop();

  const frameId = window.requestAnimationFrame(() => {
    forceScrollToTop();
  });

  return () => {
    window.cancelAnimationFrame(frameId);
  };
}

function forceScrollToTop() {
  document.querySelector(".play-shell")?.scrollIntoView({ block: "start" });
  window.scrollTo({ left: 0, top: 0 });

  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
