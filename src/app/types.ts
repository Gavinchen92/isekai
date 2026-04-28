import type {
  Adventure,
  AdventureCandidatePreview,
  JourneyMemoryEntry,
  Message,
  MessageInputKind,
  Session,
  SessionSnapshot,
  SuggestedMove,
  WorldSeedId,
  WorldSeedPreset
} from "../domain";

export type WorldSeedsState =
  | { status: "loading" }
  | { status: "success"; seeds: readonly WorldSeedPreset[] }
  | { status: "error"; message: string };

export type StartAdventureState =
  | { status: "idle" }
  | { status: "loading"; candidateId: string }
  | { status: "error"; candidateId?: string; message: string };

export type PlayState =
  | { status: "selection" }
  | {
      status: "active";
      adventure: Adventure;
      initialMessages: readonly Message[];
      initialSuggestedMoves: readonly SuggestedMove[];
      session: Session;
    };

export type SavedSessionsState =
  | { status: "loading" }
  | { status: "success"; snapshots: readonly SessionSnapshot[] }
  | { status: "error"; message: string };

export type DeleteSavedSessionState =
  | { status: "idle" }
  | { status: "loading"; sessionId: string }
  | { status: "error"; sessionId?: string; message: string };

export type NewAdventureModalState =
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

export type TurnState =
  | { status: "idle" }
  | { status: "running"; stage: TurnStage }
  | { status: "error"; message: string };

export type JourneyMemoryState =
  | { status: "loading" }
  | { status: "success"; entries: readonly JourneyMemoryEntry[] }
  | { status: "error"; message: string };

export type MoveOption = Pick<SuggestedMove, "id" | "label" | "intent">;
export type TurnStage = "classifying" | "generating" | "finalizing";

export type UserErrorCopy = {
  fallback: string;
  upstream?: string;
};

export type SubmitTurn = (content: string, inputKind: MessageInputKind) => Promise<void>;
