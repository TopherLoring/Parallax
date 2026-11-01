export interface SafeLogFields {
  port?: number;
  roomCode?: string;
  sessionId?: string;
  phase?: string;
  playerCount?: number;
  connected?: boolean;
  consented?: boolean;
  outcome?: string;
  energy?: number;
  solvedMechanismCount?: number;
  newEvidenceCount?: number;
  code?: string;
  errorType?: string;
}

export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: SafeLogFields = {},
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "parallax",
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
