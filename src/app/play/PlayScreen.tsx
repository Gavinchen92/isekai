import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  Adventure,
  JourneyMemoryEntry,
  JourneyMemoryEntryType,
  Message,
  MessageInputKind,
  Session,
  SuggestedMove
} from "../../domain";
import { fetchJourneyMemory, submitTurnStream } from "../api";
import { journeyMemoryTabs, journeyMemoryTypeLabels, turnStageLabels } from "../constants";
import type { JourneyMemoryState, MoveOption, TurnState } from "../types";
import {
  buildInitialSuggestedMoves,
  buildJourneyMemorySummaryEntries,
  formatJourneyMemoryTime,
  getLatestJourneyMemoryUpdatedAt,
  getUserFacingErrorMessage
} from "../utils";

type PlayScreenProps = {
  adventure: Adventure;
  initialMessages: readonly Message[];
  initialSuggestedMoves: readonly SuggestedMove[];
  session: Session;
  onReturnHome: () => void;
};

export function PlayScreen({
  adventure,
  initialMessages,
  initialSuggestedMoves,
  session,
  onReturnHome
}: PlayScreenProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly Message[]>(() => initialMessages);
  const [suggestedMoves, setSuggestedMoves] = useState<readonly MoveOption[]>(() =>
    initialSuggestedMoves.length > 0 ? initialSuggestedMoves : buildInitialSuggestedMoves(adventure)
  );
  const [turnState, setTurnState] = useState<TurnState>({ status: "idle" });
  const [journeyMemoryState, setJourneyMemoryState] = useState<JourneyMemoryState>({
    status: "loading"
  });
  const [isJourneyMemoryOpen, setIsJourneyMemoryOpen] = useState(false);
  const [activeJourneyMemoryType, setActiveJourneyMemoryType] =
    useState<JourneyMemoryEntryType>("identity");
  const [hasNewJourneyMemory, setHasNewJourneyMemory] = useState(false);
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string>();
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const currentTurnMessageIdsRef = useRef<{
    assistantId?: string;
    userId?: string;
  }>({});
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
          const message = getUserFacingErrorMessage(error, {
            fallback: "读取旅途见闻失败，请稍后重试。"
          });
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
      const message = getUserFacingErrorMessage(error, {
        fallback: "读取旅途见闻失败，请稍后重试。"
      });
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
    currentTurnMessageIdsRef.current = {};
    setStreamingAssistantMessageId(undefined);
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
          currentTurnMessageIdsRef.current = {
            userId: event.userMessage.id
          };
          setMessages((currentMessages) => [...currentMessages, event.userMessage]);
          return;
        }

        if (event.type === "narration_chunk") {
          currentTurnMessageIdsRef.current = {
            ...currentTurnMessageIdsRef.current,
            assistantId: event.assistantMessageId
          };
          setStreamingAssistantMessageId(event.assistantMessageId);
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
          return;
        }

        if (event.type === "turn_completed") {
          const completedMessagesById = new Map(
            event.turn.messages.map((message) => [message.id, message] as const)
          );

          setMessages((currentMessages) => {
            const replacedMessages = currentMessages.map(
              (message) => completedMessagesById.get(message.id) ?? message
            );
            const existingMessageIds = new Set(replacedMessages.map((message) => message.id));
            const missingCompletedMessages = event.turn.messages.filter(
              (message) => !existingMessageIds.has(message.id)
            );

            return [...replacedMessages, ...missingCompletedMessages];
          });
          setSuggestedMoves(event.turn.suggestedMoves);
          setStreamingAssistantMessageId(undefined);
          currentTurnMessageIdsRef.current = {};
        }
      });

      setDraft("");
      clearTurnStageTimers(stageTimersRef);
      setTurnState({ status: "idle" });
      void refreshJourneyMemory(true);
    } catch (error: unknown) {
      const message = getUserFacingErrorMessage(error, {
        fallback: "这一步没有生成成功，请重试。",
        upstream: "这一步没有生成成功，AI 服务可能暂时不可用，请重试。"
      });
      const { assistantId, userId } = currentTurnMessageIdsRef.current;

      if (assistantId || userId) {
        setMessages((currentMessages) =>
          currentMessages.filter((item) => item.id !== assistantId && item.id !== userId)
        );
      }

      currentTurnMessageIdsRef.current = {};
      setStreamingAssistantMessageId(undefined);
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
              <article
                aria-live={message.id === streamingAssistantMessageId ? "polite" : undefined}
                className="story-card"
                key={message.id}
              >
                <p>{message.content}</p>
              </article>
            ))}

            {turnState.status === "running" && !streamingAssistantMessageId ? (
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
