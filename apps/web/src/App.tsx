import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Room } from "colyseus.js";
import { clearStoredRoom, createRoom, joinRoom, reconnectRoom } from "./lib/rooms";

interface PublicPlayer {
  id: string;
  displayName: string;
  roleName: string;
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
  players: PublicPlayer[];
  solvedMechanismIds: string[];
}

interface PrivateView {
  player: { id: string; displayName: string; role: { id: string; name: string; description: string } };
  phase: string;
  energy: number;
  discoveries: Array<{ id: string; clueId?: string; title: string; content: string; discoveredBy: string }>;
  objects: Array<{ id: string; name: string; description: string; areaId: string }>;
  mechanisms: Array<{ id: string; name: string; description: string }>;
  actions: Array<{ id: string; kind: "inspect-object" | "attempt-mechanism"; label: string; targetId: string }>;
  solvedMechanismIds: string[];
  outcome: { kind: string } | null;
}

function snapshotFromState(state: any): PublicRoomSnapshot {
  return {
    phase: state.phase,
    roomCode: state.roomCode,
    hostPlayerId: state.hostPlayerId,
    scenarioTitle: state.scenarioTitle,
    energy: state.energy,
    deadline: state.deadline,
    players: Array.from(state.players ?? []).map((player: any) => ({
      id: player.id,
      displayName: player.displayName,
      roleName: player.roleName,
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const reconnectAttempted = useRef(false);

  useEffect(() => {
    if (reconnectAttempted.current) return;
    reconnectAttempted.current = true;
    if (!sessionStorage.getItem("parallax.reconnectionToken")) return;
    setError("Restoring your previous room…");
    void reconnectRoom().then((result) => {
      setRoomCode(result.roomCode);
      setRoom(result.room);
      setError("");
    }).catch(() => {
      clearStoredRoom();
      setError("Your previous room session has expired. Create or join a room.");
    });
  }, []);

  useEffect(() => {
    if (!room) return;
    const sync = (state: any) => setRoomSnapshot(snapshotFromState(state));
    room.onStateChange(sync);
    room.onMessage("game:view", (view: PrivateView) => setPrivateView(view));
    room.onMessage("game:error", (payload: { code: string }) => {
      setError(payload.code.replaceAll("_", " "));
    });
    room.send("sync", {});
    room.onMessage("game:attempt-result", (payload: { result: string; energy: number }) => {
      setNotice(payload.result === "solved" ? "Mechanism solved." : payload.result === "incorrect" ? `Incorrect attempt. ${payload.energy} energy remaining.` : "Attempt accepted.");
    });
    room.onLeave(() => {
      if (sessionStorage.getItem("parallax.reconnectionToken")) {
        setError("Connection interrupted. Reconnecting…");
        void reconnectRoom().then((result) => {
          setRoomCode(result.roomCode);
          setRoom(result.room);
          setError("");
        }).catch(() => {
          clearStoredRoom();
          setRoom(null);
          setRoomSnapshot(null);
          setPrivateView(null);
          setError("Reconnection failed. Join again with the room code.");
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
    setError("");
    setNotice("");
    try {
      const result = action === "create"
        ? await createRoom(displayName)
        : await joinRoom(roomCode, displayName);
      setRoomCode(result.roomCode);
      setRoom(result.room);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Unable to connect.");
    } finally {
      setBusy(false);
    }
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void connect("join");
  }

  function leaveRoom() {
    clearStoredRoom();
    const current = room;
    setRoom(null);
    setRoomSnapshot(null);
    setPrivateView(null);
    if (current) void current.leave();
  }

  const localPlayer = roomSnapshot?.players.find((player) => player.id === room?.sessionId);
  const isHost = Boolean(roomSnapshot && room && roomSnapshot.hostPlayerId === room.sessionId);
  const canStart = Boolean(
    isHost &&
    roomSnapshot &&
    roomSnapshot.players.length >= 2 &&
    roomSnapshot.players.every((player) => player.connected && player.ready),
  );

  return (
    <main className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="PARALLAX home">P<span>/</span>R</a>
        <span className="topbar-label">COOPERATIVE SIGNAL RECOVERY</span>
        <span className="status"><i /> {room ? "CONNECTED" : "SYSTEM STANDBY"}</span>
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
          </div>
        ) : (
          <div className="entry-panel room-panel">
            <div className="panel-heading"><span>02 / ROOM ESTABLISHED</span><span>{roomSnapshot?.phase.toUpperCase() ?? "CONNECTING"}</span></div>
            <div className="room-code-display">
              <div><small>SHARE THIS ROOM CODE</small><strong>{roomSnapshot?.roomCode ?? roomCode}</strong></div>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(roomSnapshot?.roomCode ?? roomCode)}>COPY</button>
            </div>
            <div className="players-heading"><span>OPERATORS</span><span>{roomSnapshot?.players.length ?? 0} / 6</span></div>
            <div className="player-list">
              {roomSnapshot?.players.map((player) => (
                <div className="player-row" key={player.id}>
                  <div className="player-mark">{player.displayName.slice(0, 1).toUpperCase()}</div>
                  <div className="player-identity"><strong>{player.displayName}{player.id === room?.sessionId ? " (YOU)" : ""}</strong><small>{player.roleName}{player.id === roomSnapshot.hostPlayerId ? " · HOST" : ""}</small></div>
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
                <div><small>SHARED ENERGY</small><strong>{roomSnapshot?.energy ?? 0}</strong></div>
                <div><small>MECHANISMS SOLVED</small><strong>{roomSnapshot?.solvedMechanismIds.length ?? 0} / 3</strong></div>
              </div>
            )}
            {error && <p className="feedback error" role="alert">{error}</p>}
            {notice && <p className="feedback notice" role="status">{notice}</p>}
            {privateView && (
              <div className="private-panel">
                <div className="panel-heading"><span>YOUR PERSPECTIVE</span><span>{privateView.player.role.name.toUpperCase()}</span></div>
                <p className="role-description">{privateView.player.role.description}</p>
                <div className="evidence-heading">PRIVATE EVIDENCE · {privateView.discoveries.length}</div>
                {privateView.discoveries.map((discovery) => (
                  <article className="evidence-card" key={discovery.id}>
                    <strong>{discovery.title}</strong>
                    <p>{discovery.content}</p>
                  </article>
                ))}
                <div className="evidence-heading">AVAILABLE OBJECTS</div>
                {privateView.objects.map((object) => {
                  const available = privateView.actions.some((action) => action.kind === "inspect-object" && action.targetId === object.id);
                  return (
                    <div className="object-row" key={object.id}>
                      <div><strong>{object.name}</strong><small>{object.description}</small></div>
                      {available && <button type="button" onClick={() => room.send("inspect", { objectId: object.id })}>INSPECT</button>}
                    </div>
                  );
                })}
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
                        <input value={answers[mechanism.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [mechanism.id]: event.target.value.slice(0, 200) }))} placeholder="ENTER SOLUTION" />
                        <button type="submit" disabled={!(answers[mechanism.id] ?? "").trim()}>SUBMIT</button>
                      </form>
                    ))}
                  </>
                )}
                {privateView.outcome && <p className="feedback notice">SESSION {privateView.outcome.kind.toUpperCase()}.</p>}
              </div>
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
