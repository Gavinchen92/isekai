import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  Adventure,
  AdventureCandidatePreview,
  JourneyMemoryEntry,
  JourneyMemoryEntryType,
  Message,
  MessageInputKind,
  Session,
  SuggestedMove,
  WorldSeedId,
  WorldSeedPreset
} from "../domain";
import {
  createAdventure,
  createSession,
  fetchJourneyMemory,
  fetchWorldSeeds,
  generateAdventureCandidates,
  submitTurnStream
} from "./api";

type WorldSeedsState =
  | { status: "loading" }
  | { status: "success"; seeds: readonly WorldSeedPreset[] }
  | { status: "error"; message: string };

type StartAdventureState =
  | { status: "idle" }
  | { status: "loading"; candidateId: string }
  | { status: "error"; candidateId?: string; message: string };

type PlayState =
  | { status: "selection" }
  | { status: "active"; adventure: Adventure; session: Session };

type NewAdventureModalState =
  | { status: "closed" }
  | { status: "selecting-seed" }
  | { status: "generating-candidates"; worldSeedId: WorldSeedId }
  | {
      status: "selecting-candidate";
      worldSeedId: WorldSeedId;
      candidates: readonly AdventureCandidatePreview[];
      startAdventureState: StartAdventureState;
    }
  | { status: "error"; worldSeedId: WorldSeedId; message: string };

type TurnState =
  | { status: "idle" }
  | { status: "running"; stage: TurnStage }
  | { status: "error"; message: string };

type JourneyMemoryState =
  | { status: "loading" }
  | { status: "success"; entries: readonly JourneyMemoryEntry[] }
  | { status: "error"; message: string };

type MoveOption = Pick<SuggestedMove, "id" | "label" | "intent">;
type TurnStage = "classifying" | "generating" | "finalizing";

const turnStageLabels: Record<TurnStage, string> = {
  classifying: "正在理解你的行动意图…",
  generating: "正在生成故事与局势变化…",
  finalizing: "正在整理推荐行动…"
};

const journeyMemoryTabs: ReadonlyArray<{ label: string; type: JourneyMemoryEntryType }> = [
  { label: "身份", type: "identity" },
  { label: "人物", type: "npc" },
  { label: "地点", type: "location" },
  { label: "关系", type: "relationship" },
  { label: "线索", type: "clue" },
  { label: "物件", type: "item" }
];

const journeyMemoryTypeLabels: Record<JourneyMemoryEntryType, string> = {
  identity: "身份",
  npc: "人物",
  location: "地点",
  relationship: "关系",
  clue: "线索",
  item: "物件"
};

export function App() {
  const [worldSeedsState, setWorldSeedsState] = useState<WorldSeedsState>({
    status: "loading"
  });
  const [newAdventureModalState, setNewAdventureModalState] = useState<NewAdventureModalState>({
    status: "closed"
  });
  const [playState, setPlayState] = useState<PlayState>({
    status: "selection"
  });
  const modalRequestIdRef = useRef(0);
  const modalAbortControllerRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (playState.status === "active") {
      return syncScrollPageToTop();
    }

    return undefined;
  }, [playState.status]);

  useEffect(() => {
    let isActive = true;

    void fetchWorldSeeds()
      .then((seeds) => {
        if (isActive) {
          setWorldSeedsState({ status: "success", seeds });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          const message = error instanceof Error ? error.message : "加载世界种子失败";
          setWorldSeedsState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  function handleBeginNewAdventure() {
    abortModalRequest();
    modalRequestIdRef.current += 1;
    setNewAdventureModalState({ status: "selecting-seed" });
  }

  function handleCloseNewAdventure() {
    abortModalRequest();
    modalRequestIdRef.current += 1;
    setNewAdventureModalState({ status: "closed" });
  }

  function handleReturnHome() {
    abortModalRequest();
    modalRequestIdRef.current += 1;
    setPlayState({ status: "selection" });
    setNewAdventureModalState({ status: "closed" });
  }

  async function handleSelectWorldSeed(seedId: WorldSeedId) {
    const requestId = modalRequestIdRef.current + 1;
    const abortController = beginModalRequest();

    modalRequestIdRef.current = requestId;

    setNewAdventureModalState({ status: "generating-candidates", worldSeedId: seedId });

    try {
      const candidates = await generateAdventureCandidates(seedId, abortController.signal);

      if (modalRequestIdRef.current !== requestId) {
        return;
      }

      setNewAdventureModalState({
        status: "selecting-candidate",
        worldSeedId: seedId,
        candidates,
        startAdventureState: { status: "idle" }
      });
    } catch (error: unknown) {
      if (modalRequestIdRef.current !== requestId) {
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      const message = error instanceof Error ? error.message : "生成冒险候选失败";
      setNewAdventureModalState({
        status: "error",
        worldSeedId: seedId,
        message
      });
    } finally {
      clearModalRequest(abortController, requestId);
    }
  }

  async function handleStartAdventure(
    candidate: AdventureCandidatePreview,
    selectedPlayerSetupId?: string
  ) {
    if (newAdventureModalState.status !== "selecting-candidate") {
      return;
    }

    const modalStateBeforeStart = newAdventureModalState;
    const requestId = modalRequestIdRef.current + 1;
    const abortController = beginModalRequest();

    modalRequestIdRef.current = requestId;

    setNewAdventureModalState({
      ...modalStateBeforeStart,
      startAdventureState: { status: "loading", candidateId: candidate.id }
    });

    try {
      const adventure = await createAdventure(
        modalStateBeforeStart.worldSeedId,
        candidate.id,
        selectedPlayerSetupId,
        abortController.signal
      );
      const session = await createSession(adventure.id);

      if (modalRequestIdRef.current !== requestId) {
        return;
      }

      setPlayState({
        status: "active",
        adventure,
        session
      });
      setNewAdventureModalState({ status: "closed" });
    } catch (error: unknown) {
      if (modalRequestIdRef.current !== requestId) {
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      const detail = error instanceof Error ? error.message : "创建冒险失败";
      setNewAdventureModalState({
        ...modalStateBeforeStart,
        startAdventureState: {
          status: "error",
          candidateId: candidate.id,
          message: `完整冒险包生成失败，可以重试当前候选或重新选择世界。${detail}`
        }
      });
    } finally {
      clearModalRequest(abortController, requestId);
    }
  }

  function abortModalRequest() {
    modalAbortControllerRef.current?.abort();
    modalAbortControllerRef.current = undefined;
  }

  function beginModalRequest(): AbortController {
    abortModalRequest();

    const abortController = new AbortController();

    modalAbortControllerRef.current = abortController;

    return abortController;
  }

  function clearModalRequest(abortController: AbortController, requestId: number) {
    if (
      modalRequestIdRef.current === requestId &&
      modalAbortControllerRef.current === abortController
    ) {
      modalAbortControllerRef.current = undefined;
    }
  }

  if (playState.status === "active") {
    return (
      <PlayScreen
        adventure={playState.adventure}
        session={playState.session}
        onReturnHome={handleReturnHome}
      />
    );
  }

  return (
    <main className="shell landing-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">本地 AI 冒险</p>
        <h1 id="page-title">Isekai</h1>
        <p className="lede">醒来、选择、承担后果。让一段新的冒险从世界的裂缝里开始。</p>
        <div className="actions" aria-label="冒险入口">
          <button type="button" onClick={handleBeginNewAdventure}>
            开始新冒险
          </button>
        </div>
      </section>

      {newAdventureModalState.status !== "closed" ? (
        <NewAdventureModal
          modalState={newAdventureModalState}
          onClose={handleCloseNewAdventure}
          onRegenerate={(seedId) => void handleSelectWorldSeed(seedId)}
          onReselectWorld={() => setNewAdventureModalState({ status: "selecting-seed" })}
          onSelectWorld={(seedId) => void handleSelectWorldSeed(seedId)}
          onStartAdventure={(candidate, selectedPlayerSetupId) =>
            void handleStartAdventure(candidate, selectedPlayerSetupId)
          }
          worldSeedsState={worldSeedsState}
        />
      ) : null}
    </main>
  );
}

type NewAdventureModalProps = {
  modalState: Exclude<NewAdventureModalState, { status: "closed" }>;
  worldSeedsState: WorldSeedsState;
  onClose: () => void;
  onRegenerate: (seedId: WorldSeedId) => void;
  onReselectWorld: () => void;
  onSelectWorld: (seedId: WorldSeedId) => void;
  onStartAdventure: (
    candidate: AdventureCandidatePreview,
    selectedPlayerSetupId?: string
  ) => void;
};

function NewAdventureModal({
  modalState,
  onClose,
  onRegenerate,
  onReselectWorld,
  onSelectWorld,
  onStartAdventure,
  worldSeedsState
}: NewAdventureModalProps) {
  const selectedSeed =
    modalState.status === "selecting-seed"
      ? undefined
      : findWorldSeed(worldSeedsState, modalState.worldSeedId);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="new-adventure-title"
        aria-modal="true"
        className="new-adventure-modal"
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">新的冒险</p>
            <h2 id="new-adventure-title">
              {modalState.status === "selecting-candidate" ? "选择冒险候选" : "选择世界种子"}
            </h2>
          </div>
          <button type="button" className="secondary compact" onClick={onClose}>
            关闭
          </button>
        </div>

        {modalState.status === "selecting-seed" ? (
          <WorldSeedSelection worldSeedsState={worldSeedsState} onSelectWorld={onSelectWorld} />
        ) : null}

        {modalState.status === "generating-candidates" ? (
          <div className="modal-loading" aria-live="polite">
            <p className="muted">
              正在为{selectedSeed ? `「${selectedSeed.name}」` : "这个世界"}构思冒险入口...
            </p>
            <p className="modal-loading-detail">
              这里只生成无剧透候选卡片，完整冒险包会在你选中后再构建。
            </p>
          </div>
        ) : null}

        {modalState.status === "error" ? (
          <div className="modal-error">
            <p className="error">{modalState.message}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => onRegenerate(modalState.worldSeedId)}>
                重新生成
              </button>
              <button type="button" className="secondary" onClick={onReselectWorld}>
                重新选择世界
              </button>
            </div>
          </div>
        ) : null}

        {modalState.status === "selecting-candidate" ? (
          <CandidateSelection
            modalState={modalState}
            onReselectWorld={onReselectWorld}
            onStartAdventure={onStartAdventure}
            selectedSeedName={selectedSeed?.name}
          />
        ) : null}
      </section>
    </div>
  );
}

type WorldSeedSelectionProps = {
  worldSeedsState: WorldSeedsState;
  onSelectWorld: (seedId: WorldSeedId) => void;
};

function WorldSeedSelection({ onSelectWorld, worldSeedsState }: WorldSeedSelectionProps) {
  if (worldSeedsState.status === "loading") {
    return <p className="muted">正在读取本地世界种子...</p>;
  }

  if (worldSeedsState.status === "error") {
    return <p className="error">{worldSeedsState.message}</p>;
  }

  return (
    <div className="seed-grid">
      {worldSeedsState.seeds.map((seed) => (
        <article className="seed-card" key={seed.id}>
          <h3>{seed.name}</h3>
          <p>{seed.description}</p>
          <div className="tags" aria-label={`${seed.name} 标签`}>
            {seed.genreTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <button type="button" className="card-action" onClick={() => onSelectWorld(seed.id)}>
            选择这个世界
          </button>
        </article>
      ))}
    </div>
  );
}

type CandidateSelectionProps = {
  modalState: Extract<NewAdventureModalState, { status: "selecting-candidate" }>;
  selectedSeedName?: string;
  onReselectWorld: () => void;
  onStartAdventure: (
    candidate: AdventureCandidatePreview,
    selectedPlayerSetupId?: string
  ) => void;
};

function CandidateSelection({
  modalState,
  onReselectWorld,
  onStartAdventure,
  selectedSeedName
}: CandidateSelectionProps) {
  const [selectedPlayerSetupIdsByCandidateId, setSelectedPlayerSetupIdsByCandidateId] = useState<
    Record<string, string>
  >({});

  function getSelectedPlayerSetupId(candidate: AdventureCandidatePreview): string | undefined {
    return (
      selectedPlayerSetupIdsByCandidateId[candidate.id] ?? candidate.playerSetupOptions[0]?.id
    );
  }

  function handleSelectPlayerSetup(candidateId: string, playerSetupId: string) {
    setSelectedPlayerSetupIdsByCandidateId((current) => ({
      ...current,
      [candidateId]: playerSetupId
    }));
  }

  return (
    <>
      <div className="modal-subheader">
        <p className="muted">
          {selectedSeedName
            ? `基于「${selectedSeedName}」生成了这些冒险入口。`
            : "选择一个冒险入口。"}
        </p>
        <button type="button" className="secondary compact" onClick={onReselectWorld}>
          重新选择世界
        </button>
      </div>

      {modalState.startAdventureState.status === "error" ? (
        <p className="error">{modalState.startAdventureState.message}</p>
      ) : null}

      <p className="candidate-stage-note">
        这些是无剧透入口。选择后才会生成完整冒险包，可能需要几十秒。
      </p>

      <div className="candidate-grid">
        {modalState.candidates.map((candidate) => {
          const selectedPlayerSetupId = getSelectedPlayerSetupId(candidate);
          const isStarting = modalState.startAdventureState.status === "loading";
          const isStartingThisCandidate =
            modalState.startAdventureState.status === "loading" &&
            modalState.startAdventureState.candidateId === candidate.id;

          return (
            <article className="candidate-card" key={candidate.id}>
              <p className="candidate-label">{candidate.tags.slice(0, 2).join(" / ")}</p>
              <h3>{candidate.title}</h3>
              <p>{candidate.teaser}</p>
              <fieldset className="setup-options">
                <legend>选择身份</legend>
                {candidate.playerSetupOptions.map((option) => (
                  <label className="setup-option" key={option.id}>
                    <input
                      checked={selectedPlayerSetupId === option.id}
                      disabled={isStarting}
                      name={`player-setup-${candidate.id}`}
                      type="radio"
                      value={option.id}
                      onChange={() => handleSelectPlayerSetup(candidate.id, option.id)}
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                className="card-action"
                disabled={isStarting || !selectedPlayerSetupId}
                onClick={() => onStartAdventure(candidate, selectedPlayerSetupId)}
              >
                {isStartingThisCandidate ? "构建中..." : "开始这个冒险"}
              </button>
              {isStartingThisCandidate ? (
                <p className="candidate-build-status" aria-live="polite">
                  正在构建完整冒险包，可能需要几十秒...
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

type PlayScreenProps = {
  adventure: Adventure;
  session: Session;
  onReturnHome: () => void;
};

function PlayScreen({ adventure, session, onReturnHome }: PlayScreenProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [suggestedMoves, setSuggestedMoves] = useState<readonly MoveOption[]>(() =>
    buildInitialSuggestedMoves(adventure)
  );
  const [turnState, setTurnState] = useState<TurnState>({ status: "idle" });
  const [journeyMemoryState, setJourneyMemoryState] = useState<JourneyMemoryState>({
    status: "loading"
  });
  const [isJourneyMemoryOpen, setIsJourneyMemoryOpen] = useState(false);
  const [activeJourneyMemoryType, setActiveJourneyMemoryType] =
    useState<JourneyMemoryEntryType>("identity");
  const [hasNewJourneyMemory, setHasNewJourneyMemory] = useState(false);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isSubmitting = turnState.status === "running";
  const canSendDraft = draft.trim().length > 0 && !isSubmitting;
  const journeyMemoryEntries =
    journeyMemoryState.status === "success" ? journeyMemoryState.entries : [];
  const journeyMemorySummaryEntries = buildJourneyMemorySummaryEntries(journeyMemoryEntries);
  const storyMessages = messages.filter((message) => message.role === "assistant");

  useEffect(() => {
    let isActive = true;

    setJourneyMemoryState({ status: "loading" });
    void fetchJourneyMemory(session.id)
      .then((entries) => {
        if (isActive) {
          setJourneyMemoryState({ status: "success", entries });
          setHasNewJourneyMemory(false);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          const message = error instanceof Error ? error.message : "读取旅途见闻失败";
          setJourneyMemoryState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, [session.id]);

  useEffect(
    () => () => {
      clearTurnStageTimers(stageTimersRef);
    },
    []
  );

  async function refreshJourneyMemory(markAsUpdated: boolean) {
    const previousLatest =
      journeyMemoryState.status === "success"
        ? getLatestJourneyMemoryUpdatedAt(journeyMemoryState.entries)
        : "";

    try {
      const entries = await fetchJourneyMemory(session.id);
      setJourneyMemoryState({ status: "success", entries });

      if (markAsUpdated && getLatestJourneyMemoryUpdatedAt(entries) !== previousLatest) {
        setHasNewJourneyMemory(true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "读取旅途见闻失败";
      setJourneyMemoryState({ status: "error", message });
    }
  }

  function openJourneyMemory(type: JourneyMemoryEntryType = activeJourneyMemoryType) {
    setActiveJourneyMemoryType(type);
    setIsJourneyMemoryOpen(true);
    setHasNewJourneyMemory(false);
  }

  async function handleSubmitTurn(content: string, inputKind: MessageInputKind) {
    const trimmedContent = content.trim();

    if (!trimmedContent || isSubmitting) {
      return;
    }

    clearTurnStageTimers(stageTimersRef);
    setTurnState({ status: "running", stage: "classifying" });
    stageTimersRef.current.push(
      setTimeout(() => {
        setTurnState((current) =>
          current.status === "running" ? { status: "running", stage: "generating" } : current
        );
      }, 420)
    );
    stageTimersRef.current.push(
      setTimeout(() => {
        setTurnState((current) =>
          current.status === "running" ? { status: "running", stage: "finalizing" } : current
        );
      }, 1200)
    );

    try {
      await submitTurnStream(session.id, trimmedContent, inputKind, (event) => {
        if (event.type === "turn_started") {
          setMessages((currentMessages) => [...currentMessages, event.userMessage]);
          return;
        }

        if (event.type === "narration_chunk") {
          setMessages((currentMessages) => {
            const existingAssistantIndex = currentMessages.findIndex(
              (message) => message.id === event.assistantMessageId
            );

            if (existingAssistantIndex === -1) {
              return [
                ...currentMessages,
                {
                  id: event.assistantMessageId,
                  sessionId: session.id,
                  role: "assistant",
                  content: event.chunk,
                  createdAt: new Date().toISOString()
                }
              ];
            }

            return currentMessages.map((message, index) =>
              index === existingAssistantIndex
                ? {
                    ...message,
                    content: `${message.content}${event.chunk}`
                  }
                : message
            );
          });
          return;
        }

        if (event.type === "suggested_moves_ready") {
          setSuggestedMoves(event.suggestedMoves);
        }
      });

      setDraft("");
      clearTurnStageTimers(stageTimersRef);
      setTurnState({ status: "idle" });
      void refreshJourneyMemory(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "提交回合失败";
      clearTurnStageTimers(stageTimersRef);
      setTurnState({ status: "error", message });
    }
  }

  return (
    <main className="play-shell">
      <section className="play-main" aria-labelledby="play-title">
        <div className="play-topbar">
          <p className="eyebrow">冒险进行中</p>
          <button type="button" className="secondary compact" onClick={onReturnHome}>
            返回首页
          </button>
        </div>

        <div className="story-pane">
          <h1 id="play-title">{adventure.title}</h1>
          <p className="play-pitch">{adventure.pitch}</p>

          <div className="story-list" aria-label="故事记录">
            <article className="story-card">
              <p>{adventure.openingScene}</p>
            </article>

            {storyMessages.map((message) => (
              <article className="story-card" key={message.id}>
                <p>{message.content}</p>
              </article>
            ))}

            {turnState.status === "running" ? (
              <article
                aria-label="故事生成中"
                aria-live="polite"
                className="story-card story-card-placeholder"
              >
                <p className="skeleton-line short" />
                <p className="skeleton-line" />
                <p className="skeleton-line long" />
              </article>
            ) : null}
          </div>
        </div>

        <section className="action-composer" aria-labelledby="action-title">
          <div className="composer-header">
            <div>
              <p className="eyebrow">下一步</p>
              <h2 id="action-title">你要怎么做？</h2>
            </div>
          </div>

          <div className="move-list" aria-label="可选行动">
            {turnState.status === "running"
              ? [1, 2, 3].map((index) => (
                  <button
                    key={`placeholder-move-${index}`}
                    type="button"
                    className="move-button move-button-placeholder"
                    disabled
                  >
                    <span className="skeleton-line" />
                  </button>
                ))
              : suggestedMoves.map((move) => (
                  <button
                    type="button"
                    className="move-button"
                    disabled={isSubmitting}
                    key={move.id}
                    onClick={() => void handleSubmitTurn(move.intent, "suggested-move")}
                  >
                    {move.label}
                  </button>
                ))}
          </div>

          {turnState.status === "running" ? (
            <p className="turn-stage-hint" aria-live="polite">
              {turnStageLabels[turnState.stage]}
            </p>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitTurn(draft, "free");
            }}
          >
            <textarea
              aria-label="你的下一步行动"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="写下你想尝试的行动、想说的话，或希望故事走向的方向。"
              rows={5}
              value={draft}
            />
            <div className="play-actions">
              <button type="submit" disabled={!canSendDraft}>
                {isSubmitting ? "生成中..." : "发送"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={isSubmitting}
                onClick={() => void handleSubmitTurn("我暂时不主动行动，观察局势如何推进。", "continue")}
              >
                继续
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!canSendDraft}
                onClick={() => void handleSubmitTurn(draft, "ooc")}
              >
                局外提醒
              </button>
            </div>
          </form>
          {turnState.status === "error" ? <p className="error">{turnState.message}</p> : null}
        </section>
      </section>

      <aside className="play-side" aria-label="冒险状态">
        <section className="side-panel">
          <p className="eyebrow">已知</p>
          <div className="memory-panel-heading">
            <h2>旅途见闻</h2>
            <button
              type="button"
              className="secondary compact memory-open-button"
              onClick={() => openJourneyMemory()}
            >
              查看
            </button>
          </div>

          {hasNewJourneyMemory ? <p className="memory-update">有新见闻</p> : null}

          <JourneyMemorySummary
            memoryState={journeyMemoryState}
            onOpenEntry={(type) => openJourneyMemory(type)}
            summaryEntries={journeyMemorySummaryEntries}
          />
        </section>
      </aside>

      {isJourneyMemoryOpen ? (
        <JourneyMemoryLayer
          activeType={activeJourneyMemoryType}
          adventure={adventure}
          entries={journeyMemoryEntries}
          onClose={() => setIsJourneyMemoryOpen(false)}
          onSelectType={setActiveJourneyMemoryType}
        />
      ) : null}
    </main>
  );
}

function clearTurnStageTimers(stageTimersRef: MutableRefObject<ReturnType<typeof setTimeout>[]>) {
  for (const timer of stageTimersRef.current) {
    clearTimeout(timer);
  }
  stageTimersRef.current = [];
}

type JourneyMemorySummaryProps = {
  memoryState: JourneyMemoryState;
  summaryEntries: readonly JourneyMemoryEntry[];
  onOpenEntry: (type: JourneyMemoryEntryType) => void;
};

function JourneyMemorySummary({
  memoryState,
  onOpenEntry,
  summaryEntries
}: JourneyMemorySummaryProps) {
  if (memoryState.status === "loading") {
    return <p className="muted">正在整理见闻...</p>;
  }

  if (memoryState.status === "error") {
    return <p className="error">{memoryState.message}</p>;
  }

  if (summaryEntries.length === 0) {
    return <p className="muted">还没有可记录的见闻。</p>;
  }

  return (
    <div className="memory-summary-list">
      {summaryEntries.map((entry) => (
        <button
          type="button"
          className="memory-summary-item"
          key={entry.id}
          onClick={() => onOpenEntry(entry.type)}
        >
          <span>{journeyMemoryTypeLabels[entry.type]}</span>
          <strong>{entry.title}</strong>
          <small>{entry.summary}</small>
        </button>
      ))}
    </div>
  );
}

type JourneyMemoryLayerProps = {
  activeType: JourneyMemoryEntryType;
  adventure: Adventure;
  entries: readonly JourneyMemoryEntry[];
  onClose: () => void;
  onSelectType: (type: JourneyMemoryEntryType) => void;
};

function JourneyMemoryLayer({
  activeType,
  adventure,
  entries,
  onClose,
  onSelectType
}: JourneyMemoryLayerProps) {
  const activeEntries = entries.filter((entry) => entry.type === activeType);

  return (
    <div className="memory-backdrop" role="presentation">
      <section
        aria-labelledby="journey-memory-title"
        aria-modal="true"
        className="memory-layer"
        role="dialog"
      >
        <div className="memory-layer-header">
          <div>
            <p className="eyebrow">{adventure.title}</p>
            <h2 id="journey-memory-title">旅途见闻</h2>
          </div>
          <button type="button" className="secondary compact" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="memory-tabs" aria-label="见闻分类">
          {journeyMemoryTabs.map((tab) => (
            <button
              type="button"
              className={tab.type === activeType ? "active" : ""}
              key={tab.type}
              onClick={() => onSelectType(tab.type)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="memory-detail-list">
          {activeEntries.length > 0 ? (
            activeEntries.map((entry) => (
              <article className="memory-detail-item" key={entry.id}>
                <div className="memory-detail-heading">
                  <div>
                    <p className="memory-entry-type">{journeyMemoryTypeLabels[entry.type]}</p>
                    <h3>{entry.title}</h3>
                  </div>
                  {entry.visibility === "uncertain" ? <span>仍存疑</span> : null}
                </div>
                <p>{entry.summary}</p>
                <ul>
                  {entry.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <p className="memory-detail-meta">
                  记录于{" "}
                  <time dateTime={entry.updatedAt}>{formatJourneyMemoryTime(entry.updatedAt)}</time>
                </p>
              </article>
            ))
          ) : (
            <p className="muted">这里还没有可确认的见闻。</p>
          )}
        </div>
      </section>
    </div>
  );
}

function buildInitialSuggestedMoves(adventure: Adventure): readonly MoveOption[] {
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

function buildJourneyMemorySummaryEntries(
  entries: readonly JourneyMemoryEntry[]
): readonly JourneyMemoryEntry[] {
  const identityEntries = entries.filter((entry) => entry.type === "identity").slice(0, 1);
  const otherEntries = [...entries]
    .filter((entry) => entry.type !== "identity")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return [...identityEntries, ...otherEntries].slice(0, 5);
}

function getLatestJourneyMemoryUpdatedAt(entries: readonly JourneyMemoryEntry[]): string {
  return entries.reduce(
    (latest, entry) => (entry.updatedAt > latest ? entry.updatedAt : latest),
    ""
  );
}

function formatJourneyMemoryTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function findWorldSeed(
  worldSeedsState: WorldSeedsState,
  seedId: WorldSeedId
): WorldSeedPreset | undefined {
  if (worldSeedsState.status !== "success") {
    return undefined;
  }

  return worldSeedsState.seeds.find((seed) => seed.id === seedId);
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name: unknown }).name === "AbortError"
  );
}

function syncScrollPageToTop(): (() => void) | undefined {
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
