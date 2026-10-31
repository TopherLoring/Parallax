import { useState } from "react";

export default function App() {
  const [roomCode, setRoomCode] = useState("");

  return (
    <main className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="PARALLAX home">P<span>/</span>R</a>
        <span className="topbar-label">COOPERATIVE SIGNAL RECOVERY</span>
        <span className="status"><i /> SYSTEM STANDBY</span>
      </header>

      <section className="hero">
        <div className="eyebrow"><span /> AN UNFINISHED TRANSMISSION</div>
        <h1>THE SIGNAL<br /><em>IS NOT</em> COMPLETE.</h1>
        <p className="intro">Every player sees a different part of the failure.<br className="desktop-break" /> Find the evidence. Share what you discover. Restore the signal.</p>

        <div className="entry-panel">
          <div className="panel-heading"><span>01 / ESTABLISH CONNECTION</span><span>2—6 OPERATORS</span></div>
          <button className="primary-button" type="button" disabled>CREATE NEW ROOM <span>↗</span></button>
          <div className="join-divider"><span /> OR JOIN AN ACTIVE ROOM <span /></div>
          <form className="join-form" onSubmit={(event) => event.preventDefault()}>
            <label className="sr-only" htmlFor="room-code">Room code</label>
            <input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="ENTER ROOM CODE" maxLength={6} autoComplete="off" />
            <button type="submit" disabled={roomCode.length !== 6}>JOIN <span>→</span></button>
          </form>
          <p className="panel-note">NO ACCOUNT. NO DOWNLOAD. JUST YOUR TEAM.</p>
        </div>

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
