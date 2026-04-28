import { useState } from "react";
import type { AdventureCandidatePreview, WorldSeedId } from "../../domain";
import type { NewAdventureModalState, WorldSeedsState } from "../types";
import { findWorldSeed } from "../utils";

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

export function NewAdventureModal({
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
