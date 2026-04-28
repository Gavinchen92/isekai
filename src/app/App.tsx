import { useEffect, useState } from "react";
import type { SessionSnapshot } from "../domain";
import { fetchWorldSeeds } from "./api";
import { NewAdventureModal } from "./new-adventure/NewAdventureModal";
import { useNewAdventureFlow } from "./new-adventure/useNewAdventureFlow";
import { PlayScreen } from "./play/PlayScreen";
import { SavedSessionsPanel } from "./saved-sessions/SavedSessionsPanel";
import { useSavedSessions } from "./saved-sessions/useSavedSessions";
import type { PlayState, WorldSeedsState } from "./types";
import { getUserFacingErrorMessage, syncScrollPageToTop } from "./utils";

export function App() {
  const [worldSeedsState, setWorldSeedsState] = useState<WorldSeedsState>({
    status: "loading",
  });
  const [playState, setPlayState] = useState<PlayState>({
    status: "selection",
  });
  const {
    deleteSavedSession,
    deleteSavedSessionState,
    reloadSavedSessions,
    resetDeleteState,
    savedSessionsState,
  } = useSavedSessions();
  const newAdventure = useNewAdventureFlow({
    onAdventureStarted: ({ adventure, session }) => {
      setPlayState({
        status: "active",
        adventure,
        initialMessages: [],
        initialSuggestedMoves: [],
        session,
      });
    },
  });

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
          const message = getUserFacingErrorMessage(error, {
            fallback: "世界种子读取失败，请刷新页面重试。",
          });
          setWorldSeedsState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  function handleReturnHome() {
    newAdventure.closeModal();
    setPlayState({ status: "selection" });
    resetDeleteState();
    reloadSavedSessions();
  }

  function handleContinueSavedSession(snapshot: SessionSnapshot) {
    newAdventure.closeModal();
    setPlayState({
      status: "active",
      adventure: snapshot.adventure,
      initialMessages: snapshot.messages,
      initialSuggestedMoves: snapshot.suggestedMoves,
      session: snapshot.session,
    });
  }

  if (playState.status === "active") {
    return (
      <PlayScreen
        adventure={playState.adventure}
        initialMessages={playState.initialMessages}
        initialSuggestedMoves={playState.initialSuggestedMoves}
        key={playState.session.id}
        session={playState.session}
        onReturnHome={handleReturnHome}
      />
    );
  }

  return (
    <main className="shell landing-shell">
      <section className="hero" aria-labelledby="page-title">
        <h1 id="page-title">Isekai</h1>
        <p className="lede">
          醒来、选择、承担后果。让一段新的冒险从世界的裂缝里开始。
        </p>
        <div className="actions">
          <button type="button" onClick={newAdventure.beginNewAdventure}>
            开始新冒险
          </button>
        </div>
      </section>

      <SavedSessionsPanel
        deleteState={deleteSavedSessionState}
        savedSessionsState={savedSessionsState}
        onDelete={(snapshot) => void deleteSavedSession(snapshot)}
        onContinue={handleContinueSavedSession}
      />

      {newAdventure.modalState.status !== "closed" ? (
        <NewAdventureModal
          modalState={newAdventure.modalState}
          onClose={newAdventure.closeModal}
          onRegenerate={(seedId) => void newAdventure.selectWorldSeed(seedId)}
          onReselectWorld={newAdventure.reselectWorld}
          onSelectWorld={(seedId) => void newAdventure.selectWorldSeed(seedId)}
          onStartAdventure={(candidate, selectedPlayerSetupId) =>
            void newAdventure.startAdventure(candidate, selectedPlayerSetupId)
          }
          worldSeedsState={worldSeedsState}
        />
      ) : null}
    </main>
  );
}
