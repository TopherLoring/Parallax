import { scenarioSchema } from "@parallax/game";
import { sharedSignalScenario } from "@parallax/game/server-scenario";

/** Validated, server-only scenario definition. Never serialize this object to clients. */
export const activeScenario = scenarioSchema.parse(sharedSignalScenario);
