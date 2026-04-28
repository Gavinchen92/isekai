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
  const moves = buildScenePaletteMoves(adventure).slice(0, 3);

  if (moves.length < 3) {
    throw new Error("adventure narrative engine must provide at least three initial scene moves");
  }

  return moves;
}

function buildScenePaletteMoves(adventure: Adventure): MoveOption[] {
  return adventure.scenePalette.slice(0, 3).map((scene, index) => {
    const action = scene.expectedPlayerActions[index % scene.expectedPlayerActions.length] ?? "推进";
    const normalizedAction = normalizeAttemptAction(action);
    const sceneType = scene.type.toLocaleLowerCase();
    const firstNpcName = adventure.npcWeb[index]?.npcName ?? adventure.npcSeeds[0]?.name;
    const firstLocationName = adventure.locations[index]?.name ?? adventure.locations[0]?.name;
    const pressureClockName = adventure.pressureClocks[index]?.name ?? adventure.pressureClocks[0]?.name;

    if (/negotiation|relationship|social|交涉|关系/u.test(sceneType) && firstNpcName) {
      return {
        id: `initial-scene-${index + 1}`,
        label: `尝试向 ${firstNpcName} ${normalizedAction}`,
        intent: `玩家尝试向 ${firstNpcName} ${normalizedAction}，目标是${scene.purpose}`
      };
    }

    if (/investigation|exploration|search|调查|探索/u.test(sceneType) && firstLocationName) {
      return {
        id: `initial-scene-${index + 1}`,
        label: `尝试在 ${firstLocationName} ${normalizedAction}`,
        intent: `玩家尝试在 ${firstLocationName} ${normalizedAction}，目标是${scene.purpose}`
      };
    }

    if (/confrontation|escape|conflict|对峙|逃亡|冲突/u.test(sceneType) && pressureClockName) {
      return {
        id: `initial-scene-${index + 1}`,
        label: `尝试处理「${pressureClockName}」：${normalizedAction}`,
        intent: `玩家尝试处理「${pressureClockName}」，目标是${scene.purpose}`
      };
    }

    return {
      id: `initial-scene-${index + 1}`,
      label: `尝试${normalizedAction}，推进「${trimMoveText(scene.purpose)}」`,
      intent: `玩家尝试${normalizedAction}，目标是${scene.purpose}`
    };
  });
}

function normalizeAttemptAction(action: string): string {
  return action.replace(/^(尝试|试图|谨慎)\s*/u, "").trim();
}

function trimMoveText(text: string): string {
  const normalized = text.trim();

  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
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
