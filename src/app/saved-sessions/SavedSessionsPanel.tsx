import type { SessionSnapshot } from "../../domain";
import { storyActLabels } from "../constants";
import type { DeleteSavedSessionState, SavedSessionsState } from "../types";
import { formatSavedSessionTime, getAssistantMessageCount } from "../utils";

type SavedSessionsPanelProps = {
  savedSessionsState: SavedSessionsState;
  deleteState: DeleteSavedSessionState;
  onContinue: (snapshot: SessionSnapshot) => void;
  onDelete: (snapshot: SessionSnapshot) => void;
};

export function SavedSessionsPanel({
  deleteState,
  onContinue,
  onDelete,
  savedSessionsState
}: SavedSessionsPanelProps) {
  if (savedSessionsState.status === "loading") {
    return null;
  }

  if (savedSessionsState.status === "error") {
    return (
      <section className="save-panel" aria-labelledby="saved-sessions-title">
        <h2 id="saved-sessions-title">冒险存档</h2>
        <p className="error">读取本地存档失败：{savedSessionsState.message}</p>
      </section>
    );
  }

  if (savedSessionsState.snapshots.length === 0) {
    return null;
  }

  return (
    <section className="save-panel" aria-labelledby="saved-sessions-title">
      <div className="save-panel-heading">
        <div>
          <p className="eyebrow">继续游玩</p>
          <h2 id="saved-sessions-title">冒险存档</h2>
        </div>
        <span>{savedSessionsState.snapshots.length} 个记录</span>
      </div>

      {deleteState.status === "error" ? <p className="error">{deleteState.message}</p> : null}

      <div className="save-list">
        {savedSessionsState.snapshots.map((snapshot) => {
          const isDeleting =
            deleteState.status === "loading" && deleteState.sessionId === snapshot.session.id;

          return (
            <article className="save-card" key={snapshot.session.id}>
              <div>
                <h3>{snapshot.adventure.title}</h3>
                <p>{snapshot.adventure.pitch}</p>
                <div className="save-meta" aria-label={`${snapshot.adventure.title} 存档信息`}>
                  <span>最近更新 {formatSavedSessionTime(snapshot.session.updatedAt)}</span>
                  <span>{getAssistantMessageCount(snapshot)} 段剧情</span>
                  <span>{storyActLabels[snapshot.session.currentAct]}</span>
                </div>
              </div>
              <div className="save-actions">
                <button
                  type="button"
                  className="secondary compact"
                  disabled={deleteState.status === "loading"}
                  onClick={() => onDelete(snapshot)}
                >
                  {isDeleting ? "删除中..." : "删除"}
                </button>
                <button
                  type="button"
                  className="compact"
                  disabled={deleteState.status === "loading"}
                  onClick={() => onContinue(snapshot)}
                >
                  继续
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
