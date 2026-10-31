import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Room } from "colyseus.js";
import { clearStoredRoom, createRoom, joinRoom, reconnectRoom } from "./lib/rooms";

interface PublicPlayer {
  id: string;
  displayName: string;
  connected: boolean;
  ready: boolean;
}

interface PublicRoomSnapshot {
  phase: string;
  roomCode: string;
  hostPlayerId: string;
  scenarioTitle: string;
  energy: number;
  deadline: number;
  remainingSeconds: number;
  players: PublicPlayer[];
  solvedMechanismIds: string[];
}

interface PrivateView {
  player: { id: string; displayName: string; role: { id: string; name: string; description: string } };
  phase: string;
  energy: number;
  discoveries: Array<{ id: string; clueId?: string; title: string; content: string; discoveredBy: string; discoveredAt: number; sourceObjectId: string; sourceObjectName: string; discoveredByName: string }>;
  objects: Array<{ id: string; name: string; description: string; areaId: string; status: "available" | "locked" | "used"; canInspect: boolean }>;
  mechanisms: Array<{ id: string; name: string; description: string }>;
  actions: Array<{ id: string; kind: "inspect-object" | "attempt-mechanism"; label: string; targetId: string }>;
  solvedMechanismIds: string[];
  outcome: { kind: string; completedAt: number } | null;
}

const ERROR_COPY: Record<string, string> = {
  room_code_invalid_or_expired: "That room code is invalid or has expired.",
  room_code_expired: "That room code has expired. Ask the host to create a new room.",
  room_unavailable: "That room is full or no longer accepting players.",
  room_full: "This room already has six operators.",
  host_only: "Only the host can start or restart the mission.",
  object_unavailable: "That object is not available in your perspective yet.",
  mechanism_unavailable: "That mechanism is not available to your role yet.",
  game_not_active: "The mission is no longer active.",
  rate_limited: "Too many messages. Wait a moment and try again.",
  attempt_rate_limited: "Too many mechanism attempts. Wait before trying again.",
  invalid_request: "The request could not be validated.",
  internal_error: "The server encountered an error. Try again.",
};

function formatError(code: string): string {
  return ERROR_COPY[code] ?? code.replaceAll("_", " ");
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function snapshotFromState(state: any): PublicRoomSnapshot {
  return {
    phase: state.phase,
    roomCode: state.roomCode,
    hostPlayerId: state.hostPlayerId,
    scenarioTitle: state.scenarioTitle,
    energy: state.energy,
    deadline: state.deadline,
    remainingSeconds: state.remainingSeconds,
    players: Array.from(state.players ?? []).map((player: any) => ({
      id: player.id,
      displayName: player.displayName,
      connected: player.connected,
      ready: player.ready,
    })),
    solvedMechanismIds: Array.from(state.solvedMechanismIds ?? []),
  };
}

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [roomSnapshot, setRoomSnapshot] = useState<PublicRoomSnapshot | null>(null);
  const [privateView, setPrivateView] = useState<PrivateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("standby");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const reconnectAttempted = useRef(false);

  useEffect(() => {
    if (reconnectAttempted.current) return;
    reconnectAttempted.current = true;
    if (!sessionStorage.getItem("parallax.reconnectionToken")) return;
    setError("Restoring your previous room…");
    setConnectionStatus("reconnecting");
    void reconnectRoom().then((result) => {
      setRoomCode(result.roomCode);
      setRoom(result.room);
      setError("");
      setConnectionStatus("connected");
    }).catch(() => {
      clearStoredRoom();
      setError("Your previous room session has expired. Create or join a room.");
      setConnectionStatus("disconnected");
    });
  }, []);

  useEffect(() => {
    if (roomSnapshot?.phase === "lobby") {
      setAnswers({});
      setNotice("");
    }
  }, [roomSnapshot?.phase]);

  useEffect(() => {
    if (!room) return;
    const sync = (state: any) => setRoomSnapshot(snapshotFromState(state));
    room.onStateChange(sync);
    room.onMessage("game:view", (view: PrivateView) => setPrivateView(view));
    room.onMessage("game:error", (payload: { code: string }) => {
      setError(formatError(payload.code));
    });
    room.onMessage("game:inspect-result", (payload: { result: string; newEvidenceCount: number }) => {
      setNotice(payload.result === "new-evidence"
        ? `${payload.newEvidenceCount} new evidence item(s) added to your journal.`
        : "No new evidence. You can revisit this source anytime at no energy cost.");
    });
    room.onMessage("game:attempt-result", (payload: { result: string; energy: number }) => {
      setNotice(payload.result === "solved" ? "Mechanism solved." : payload.result === "incorrect" ? `Incorrect attempt. ${payload.energy} energy remaining.` : "Attempt accepted.");
    });
    room.onMessage("game:ack", () => {
      setNotice("Duplicate submission ignored. Shared energy was not charged again.");
    });
    room.send("sync", {});
    room.onLeave(() => {
      if (sessionStorage.getItem("parallax.reconnectionToken")) {
        setError("Connection interrupted. Reconnecting…");
        setConnectionStatus("reconnecting");
        void reconnectRoom().then((result) => {
          setRoomCode(result.roomCode);
          setRoom(result.room);
          setError("");
          setConnectionStatus("connected");
        }).catch(() => {
          clearStoredRoom();
          setRoom(null);
          setRoomSnapshot(null);
          setPrivateView(null);
          setError("Reconnection failed. Join again with the room code.");
          setConnectionStatus("disconnected");
        });
        return;
      }
      setRoom(null);
      setRoomSnapshot(null);
      setPrivateView(null);
      setError("You left the room.");
    });
    if (room.state) sync(room.state);
  }, [room]);

  async function connect(action: "create" | "join") {
    if (!displayName.trim()) {
      setError("Enter a display name first.");
      return;
    }
    setBusy(true);
    setConnectionStatus("connecting");
    setError("");
    setNotice("");
    try {
      const result = action === "create"
        ? await createRoom(displayName)
        : await joinRoom(roomCode, displayName);
      setRoomCode(result.roomCode);
      setRoom(result.room);
      setConnectionStatus("connected");
    } catch (cause) {
      setError(cause instanceof Error ? formatError(cause.message) : "Unable to connect.");
      setConnectionStatus("disconnected");
    } finally {
      setBusy(false);
    }
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void connect("join");
  }

  async function copyRoomCode() {
    const code = roomSnapshot?.roomCode ?? roomCode;
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Room code copied. Send it to your team.");
    } catch {
      setError("Clipboard access is unavailable. Select the room code and copy it manually.");
    }
  }

  function leaveRoom() {
    clearStoredRoom();
    const current = room;
    setRoom(null);
    setRoomSnapshot(null);
    setPrivateView(null);
    setConnectionStatus("standby");
    if (current) void current.leave();
  }

  useEffect(() => {
    const handleOffline = () => {
      setConnectionStatus("offline");
      setError("Network connection lost. Your room will attempt to reconnect.");
    };
    const handleOnline = () => {
      if (room) setConnectionStatus("reconnecting");
      else setConnectionStatus("standby");
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [room]);

  const localPlayer = roomSnapshot?.players.find((player) => player.id === room?.sessionId);
  const isHost = Boolean(roomSnapshot && room && roomSnapshot.hostPlayerId === room.sessionId);
  const canStart = Boolean(
    isHost &&
    roomSnapshot &&
    roomSnapshot.players.filter((player) => player.connected).length >= 2 &&
    roomSnapshot.players.filter((player) => player.connected).every((player) => player.ready),
  );

  return (
    <><a className="skip-link" href="#main-content">Skip to game content</a><main id="main-content" className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="PARALLAX home">P<span>/</span>R</a>
        <span className="topbar-label">COOPERATIVE SIGNAL RECOVERY</span>
        <span className={`status status-${connectionStatus}`} role="status" aria-live="polite"><i /> {connectionStatus.toUpperCase()}</span>
      </header>

      <section className="hero">
        <div className="eyebrow"><span /> AN UNFINISHED TRANSMISSION</div>
        <h1>THE SIGNAL<br /><em>IS NOT</em> COMPLETE.</h1>
        <p className="intro">Every player sees a different part of the failure.<br className="desktop-break" /> Find the evidence. Share what you discover. Restore the signal.</p>

        {!room ? (
          <div className="entry-panel">
            <div className="panel-heading"><span>01 / ESTABLISH CONNECTION</span><span>2—6 OPERATORS</span></div>
            <label className="field-label" htmlFor="display-name">OPERATOR NAME</label>
            <input
              className="name-input"
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value.slice(0, 20))}
              placeholder="ENTER YOUR NAME"
              maxLength={20}
              autoComplete="nickname"
            />
            <button className="primary-button" type="button" disabled={busy || !displayName.trim()} onClick={() => void connect("create")}>
              {busy ? "CONNECTING…" : "CREATE NEW ROOM"} <span>↗</span>
            </button>
            <div className="join-divider"><span /> OR JOIN AN ACTIVE ROOM <span /></div>
            <form className="join-form" onSubmit={submitJoin}>
              <label className="sr-only" htmlFor="room-code">Room code</label>
              <input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 6))} placeholder="ENTER ROOM CODE" maxLength={6} autoComplete="off" />
              <button type="submit" disabled={busy || roomCode.length !== 6 || !displayName.trim()}>JOIN <span>→</span></button>
            </form>
            {error && <p className="feedback error" role="alert">{error}</p>}
            <p className="panel-note">NO ACCOUNT. NO DOWNLOAD. JUST YOUR TEAM.</p>
            <section className="how-to-play" aria-labelledby="how-to-play-title">
              <div id="how-to-play-title" className="how-to-play-title">HOW TO PLAY · 7 MINUTES</div>
              <ol>
                <li><strong>Form a team.</strong> 2–6 operators share one room code.</li>
                <li><strong>Get different perspectives.</strong> Your private role determines what you can discover.</li>
                <li><strong>Investigate and communicate.</strong> Inspect the room, then share evidence through your own voice or chat channel.</li>
                <li><strong>Restore together.</strong> Systems enters the recovery sequence; Signals confirms the final restoration.</li>
              </ol>
              <p>No in-game chat is provided. Keep your private evidence in your own journal and tell your teammate what matters.</p>
            </section>
          </div>
        ) : (
          <div className="entry-panel room-panel">
            <div className="panel-heading"><span>02 / ROOM ESTABLISHED</span><span>{roomSnapshot?.phase.toUpperCase() ?? "CONNECTING"}</span></div>
            <div className="room-code-display">
              <div><small>SHARE THIS ROOM CODE</small><strong>{roomSnapshot?.roomCode ?? roomCode}</strong></div>
              <button type="button" onClick={() => void copyRoomCode()} aria-label="Copy room code">COPY</button>
            </div>
            <div className="players-heading"><span>OPERATORS</span><span>{roomSnapshot?.players.filter((player) => player.connected).length ?? 0} / 6</span></div>
            <div className="player-list" aria-label="Room operators">
              {roomSnapshot?.players.map((player) => (
                <div className="player-row" key={player.id}>
                  <div className="player-mark">{player.displayName.slice(0, 1).toUpperCase()}</div>
                  <div className="player-identity"><strong>{player.displayName}{player.id === room?.sessionId ? " (YOU)" : ""}</strong><small>{player.id === room?.sessionId ? privateView?.player.role.name ?? "YOUR ROLE" : "PERSPECTIVE SEALED"}{player.id === roomSnapshot.hostPlayerId ? " · HOST" : ""}</small></div>
                  <span className={`player-state ${player.ready ? "is-ready" : ""}`}>{player.connected ? player.ready ? "READY" : "NOT READY" : "OFFLINE"}</span>
                </div>
              ))}
            </div>
            {roomSnapshot?.phase === "lobby" ? (
              <div className="lobby-controls">
                <button className="secondary-button" type="button" onClick={() => room.send("ready", { ready: !localPlayer?.ready })}>
                  {localPlayer?.ready ? "CANCEL READY" : "I'M READY"}
                </button>
                {isHost && <button className="primary-button" type="button" disabled={!canStart} onClick={() => room.send("start", {})}>START MISSION <span>↗</span></button>}
              </div>
            ) : (
              <div className="active-room-summary">
                <div><small>TIME REMAINING</small><strong>{formatTime(roomSnapshot?.remainingSeconds ?? 0)}</strong></div>
                <div><small>SHARED ENERGY</small><strong>{roomSnapshot?.energy ?? 0}</strong></div>
                <div><small>MECHANISMS SOLVED</small><strong>{roomSnapshot?.solvedMechanismIds.length ?? 0} / 4</strong></div>
              </div>
            )}
            {error && <p className="feedback error" role="alert">{error}</p>}
            {notice && <p className="feedback notice" role="status">{notice}</p>}
            {privateView && (
              <section className="private-panel" aria-label="Your private game perspective">
                <div className="panel-heading"><span>YOUR PERSPECTIVE</span><span>{privateView.player.role.name.toUpperCase()}</span></div>
                <p className="role-description">{privateView.player.role.description}</p>
                <div className="evidence-heading">PERSONAL EVIDENCE JOURNAL · {privateView.discoveries.length}</div>
                {privateView.discoveries.map((discovery) => {
                  const canRevisit = privateView.actions.some((action) =>
                    action.kind === "inspect-object" && action.targetId === discovery.sourceObjectId,
                  );
                  return (
                    <article className="evidence-card" key={discovery.id}>
                      <div className="evidence-card-top">
                        <strong>{discovery.title}</strong>
                        <small>{new Date(discovery.discoveredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                      <p>{discovery.content}</p>
                      <div className="evidence-meta">SOURCE: {discovery.sourceObjectName} · FOUND BY: {discovery.discoveredByName}</div>
                      {canRevisit && <button className="revisit-button" type="button" aria-label={`Revisit ${discovery.sourceObjectName}`} onClick={() => room.send("inspect", { objectId: discovery.sourceObjectId })}>REVISIT SOURCE ↗</button>}
                    </article>
                  );
                })}
                <div className="evidence-heading">ENVIRONMENT MAP · AUTHORIZED VIEW</div>
                <div className="control-room-scene">
                  {(["control-room", "relay-sublevel"] as const).map((areaId) => {
                    const areaObjects = privateView.objects.filter((object) => object.areaId === areaId);
                    if (areaObjects.length === 0) return null;
                    return (
                      <section className="scene-area" key={areaId}>
                        <div className="scene-area-title"><span>{areaId === "control-room" ? "01 / CONTROL ROOM" : "02 / RELAY SUBLEVEL"}</span><small>{areaObjects.length} VISIBLE OBJECTS</small></div>
                        <div className="scene-nodes">
                          {areaObjects.map((object) => (
                            <article className={`scene-node scene-node-${object.status}`} key={object.id}>
                              <div className="scene-node-top">
                                <span className="scene-node-glyph">{object.id === "signal-receiver" ? "∿" : object.id === "frequency-lock" ? "◈" : object.id === "network-node" ? "⌘" : object.id === "restoration-array" ? "⌁" : "▣"}</span>
                                <span className={`scene-state scene-state-${object.status}`}>{object.status.toUpperCase()}</span>
                              </div>
                              <strong>{object.name}</strong>
                              <p>{object.description}</p>
                              {object.canInspect && (
                                <button type="button" aria-label={`${object.status === "used" ? "Revisit" : "Inspect"} ${object.name}`} onClick={() => room.send("inspect", { objectId: object.id })}>
                                  {object.status === "used" ? "REVISIT" : "INSPECT"} ↗
                                </button>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                {privateView.mechanisms.length > 0 && (
                  <>
                    <div className="evidence-heading">AVAILABLE MECHANISMS</div>
                    {privateView.mechanisms.map((mechanism) => (
                      <form className="mechanism-row" key={mechanism.id} onSubmit={(event) => {
                        event.preventDefault();
                        room.send("attempt", {
                          mechanismId: mechanism.id,
                          answer: answers[mechanism.id] ?? "",
                          actionId: crypto.randomUUID(),
                        });
                      }}>
                        <div><strong>{mechanism.name}</strong><small>{mechanism.description}</small></div>
                        <input aria-label={`Solution for ${mechanism.name}`} value={answers[mechanism.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [mechanism.id]: event.target.value.slice(0, 200) }))} placeholder="ENTER SOLUTION" />
                        <button type="submit" disabled={!(answers[mechanism.id] ?? "").trim()}>SUBMIT</button>
                      </form>
                    ))}
                  </>
                )}
                {privateView.outcome && (
                  <section role="status" aria-live="polite" className={`results-panel ${privateView.outcome.kind === "victory" ? "results-victory" : "results-failure"}`}>
                    <div className="results-kicker">SESSION COMPLETE</div>
                    <h3>{privateView.outcome.kind === "victory" ? "SIGNAL RESTORED" : "TRANSMISSION LOST"}</h3>
                    <p>{privateView.outcome.kind === "victory"
                      ? "Both perspectives contributed to the recovery. The settlement link is back online."
                      : privateView.outcome.kind === "timeout"
                        ? "The recovery window closed before the relay could be restored."
                        : "Shared energy was exhausted before the recovery sequence was completed."}</p>
                    <div className="results-stats">
                      <span>MECHANISMS {roomSnapshot?.solvedMechanismIds.length ?? 0} / 4</span>
                      <span>ENERGY {roomSnapshot?.energy ?? 0}</span>
                      <span>COMPLETED {new Date(privateView.outcome.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {isHost
                      ? <button className="primary-button" type="button" onClick={() => room.send("restart", {})}>START REMATCH <span>↗</span></button>
                      : <small className="rematch-wait">WAITING FOR HOST TO START A REMATCH</small>}
                  </section>
                )}
              </section>
            )}
            <button className="leave-button" type="button" onClick={leaveRoom}>LEAVE ROOM</button>
          </div>
        )}

        <div className="principles">
          <div><b>01</b><span>INVESTIGATE</span><small>Nothing is revealed for free.</small></div>
          <div><b>02</b><span>CONNECT</span><small>Your evidence is incomplete alone.</small></div>
          <div><b>03</b><span>RESTORE</span><small>Think together. Act together.</small></div>
        </div>
      </section>

      <footer><span>PARALLAX // THE SHARED SIGNAL</span><span>CONNECTION REQUIRED · TRANSMISSION PENDING</span></footer>
    </main>
  );
}
