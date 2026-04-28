import { useEffect, useState } from "react";
import type { SessionSnapshot } from "../../domain";
import { deleteSession, fetchSessionSnapshots } from "../api";
import type { DeleteSavedSessionState, SavedSessionsState } from "../types";
import { confirmDeleteSavedSession, getUserFacingErrorMessage } from "../utils";

export function useSavedSessions() {
  const [savedSessionsState, setSavedSessionsState] = useState<SavedSessionsState>({
    status: "loading"
  });
  const [deleteSavedSessionState, setDeleteSavedSessionState] =
    useState<DeleteSavedSessionState>({ status: "idle" });

  useEffect(() => {
    let isActive = true;

    void refreshSavedSessions((nextState) => {
      if (isActive) {
        setSavedSessionsState(nextState);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  function reloadSavedSessions() {
    setSavedSessionsState({ status: "loading" });
    void refreshSavedSessions(setSavedSessionsState);
  }

  function resetDeleteState() {
    setDeleteSavedSessionState({ status: "idle" });
  }

  async function deleteSavedSession(snapshot: SessionSnapshot) {
    if (!confirmDeleteSavedSession(snapshot.adventure.title)) {
      return;
    }

    setDeleteSavedSessionState({ status: "loading", sessionId: snapshot.session.id });

    try {
      await deleteSession(snapshot.session.id);
      setSavedSessionsState((current) =>
        current.status === "success"
          ? {
              status: "success",
              snapshots: current.snapshots.filter(
                (item) => item.session.id !== snapshot.session.id
              )
            }
          : current
      );
      setDeleteSavedSessionState({ status: "idle" });
    } catch (error: unknown) {
      const message = getUserFacingErrorMessage(error, {
        fallback: "删除存档失败，请稍后重试。"
      });
      setDeleteSavedSessionState({
        status: "error",
        sessionId: snapshot.session.id,
        message
      });
    }
  }

  return {
    savedSessionsState,
    deleteSavedSessionState,
    deleteSavedSession,
    reloadSavedSessions,
    resetDeleteState
  };
}

async function refreshSavedSessions(
  setState: (nextState: SavedSessionsState) => void
): Promise<void> {
  try {
    const snapshots = await fetchSessionSnapshots();

    setState({ status: "success", snapshots });
  } catch (error: unknown) {
    const message = getUserFacingErrorMessage(error, {
      fallback: "读取本地存档失败，请稍后重试。"
    });

    setState({ status: "error", message });
  }
}
