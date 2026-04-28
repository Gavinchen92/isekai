import { useRef, useState } from "react";
import type { Adventure, AdventureCandidatePreview, Session, WorldSeedId } from "../../domain";
import { createAdventure, createSession, generateAdventureCandidates } from "../api";
import type { NewAdventureModalState } from "../types";
import { getUserFacingErrorMessage, isAbortError } from "../utils";

type StartedAdventure = {
  adventure: Adventure;
  session: Session;
};

type UseNewAdventureFlowOptions = {
  onAdventureStarted: (startedAdventure: StartedAdventure) => void;
};

export function useNewAdventureFlow({ onAdventureStarted }: UseNewAdventureFlowOptions) {
  const [modalState, setModalState] = useState<NewAdventureModalState>({
    status: "closed"
  });
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  function beginNewAdventure() {
    abortRequest();
    requestIdRef.current += 1;
    setModalState({ status: "selecting-seed" });
  }

  function closeModal() {
    abortRequest();
    requestIdRef.current += 1;
    setModalState({ status: "closed" });
  }

  function reselectWorld() {
    setModalState({ status: "selecting-seed" });
  }

  async function selectWorldSeed(seedId: WorldSeedId) {
    const requestId = requestIdRef.current + 1;
    const abortController = beginRequest();

    requestIdRef.current = requestId;
    setModalState({ status: "generating-candidates", worldSeedId: seedId });

    try {
      const candidates = await generateAdventureCandidates(seedId, abortController.signal);

      if (requestIdRef.current !== requestId) {
        return;
      }

      setModalState({
        status: "selecting-candidate",
        worldSeedId: seedId,
        candidates,
        startAdventureState: { status: "idle" }
      });
    } catch (error: unknown) {
      if (requestIdRef.current !== requestId || isAbortError(error)) {
        return;
      }

      const message = getUserFacingErrorMessage(error, {
        fallback: "生成冒险入口失败，请重试。",
        upstream: "AI 服务超时或暂时不可用，请重试生成冒险入口。"
      });
      setModalState({
        status: "error",
        worldSeedId: seedId,
        message
      });
    } finally {
      clearRequest(abortController, requestId);
    }
  }

  async function startAdventure(
    candidate: AdventureCandidatePreview,
    selectedPlayerSetupId?: string
  ) {
    if (modalState.status !== "selecting-candidate") {
      return;
    }

    const modalStateBeforeStart = modalState;
    const requestId = requestIdRef.current + 1;
    const abortController = beginRequest();

    requestIdRef.current = requestId;

    setModalState({
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

      if (requestIdRef.current !== requestId) {
        return;
      }

      onAdventureStarted({ adventure, session });
      setModalState({ status: "closed" });
    } catch (error: unknown) {
      if (requestIdRef.current !== requestId || isAbortError(error)) {
        return;
      }

      const message = getUserFacingErrorMessage(error, {
        fallback: "完整冒险包生成失败，可以重试当前候选或重新选择世界。",
        upstream:
          "完整冒险包生成失败，AI 服务超时或暂时不可用。可以重试当前候选或重新选择世界。"
      });
      setModalState({
        ...modalStateBeforeStart,
        startAdventureState: {
          status: "error",
          candidateId: candidate.id,
          message
        }
      });
    } finally {
      clearRequest(abortController, requestId);
    }
  }

  function abortRequest() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
  }

  function beginRequest(): AbortController {
    abortRequest();

    const abortController = new AbortController();

    abortControllerRef.current = abortController;

    return abortController;
  }

  function clearRequest(abortController: AbortController, requestId: number) {
    if (requestIdRef.current === requestId && abortControllerRef.current === abortController) {
      abortControllerRef.current = undefined;
    }
  }

  return {
    modalState,
    beginNewAdventure,
    closeModal,
    reselectWorld,
    selectWorldSeed,
    startAdventure
  };
}
