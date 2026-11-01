import { describe, expect, it } from "vitest";
import { scenarioSchema } from "./scenario";
import { sharedSignalScenario } from "./scenarios/shared-signal";

const validScenario = {
  schemaVersion: 1,
  id: "shared-signal",
  title: "The Shared Signal",
  description: "Restore the communications relay.",
  durationSeconds: 420,
  startingEnergy: 100,
  perspectives: [
    { id: "operator", name: "Operator", description: "Reads system diagnostics.", visibleObjectIds: ["console"], visibleClueIds: ["diagnostic"], usableMechanismIds: ["relay"] },
    { id: "analyst", name: "Analyst", description: "Reads signal records.", visibleObjectIds: ["console"], visibleClueIds: ["transmission"], usableMechanismIds: ["relay"] },
  ],
  objects: [
    { id: "console", name: "Relay Console", description: "A damaged communications console.", areaId: "control", inspectable: true, interactable: true },
  ],
  clues: [
    { id: "diagnostic", title: "System Diagnostic", content: "The relay requires phase 3.", sourceObjectId: "console", visibility: { kind: "role", roleIds: ["operator"] } },
    { id: "transmission", title: "Signal Record", content: "The signal offset is 7.", sourceObjectId: "console", visibility: { kind: "role", roleIds: ["analyst"] } },
  ],
  mechanisms: [
    { id: "relay", name: "Restore Relay", description: "Enter the coordinated phase and offset.", acceptedAnswers: ["3:7"], failedAttemptEnergyCost: 5, unlockObjectIds: [] },
  ],
  actions: [
    { id: "inspect-console", kind: "inspect-object", label: "Inspect console", targetObjectId: "console" },
    { id: "restore-relay", kind: "attempt-mechanism", label: "Restore relay", targetMechanismId: "relay" },
  ],
  winCondition: [{ kind: "mechanism-solved", mechanismId: "relay" }],
};

describe("versioned scenario schema", () => {
  it("validates the complete asymmetric Shared Signal scenario", () => {
    const result = scenarioSchema.parse(sharedSignalScenario);
    expect(result.id).toBe("shared-signal");
    expect(result.perspectives).toHaveLength(2);
    expect(result.mechanisms.map((mechanism) => mechanism.id)).toEqual([
      "frequency-lock", "network-auth", "relay-restoration",
    ]);
  });

  it("parses a valid version 1 scenario and applies safe defaults", () => {
    const result = scenarioSchema.parse(validScenario);
    expect(result.schemaVersion).toBe(1);
    expect(result.objects[0]?.inspectable).toBe(true);
    expect(result.objects[0]?.visibility).toEqual({ kind: "shared" });
    expect(result.failureConditions).toEqual(["timeout", "energy-depleted"]);
  });

  it("rejects unsupported schema versions", () => {
    expect(scenarioSchema.safeParse({ ...validScenario, schemaVersion: 2 }).success).toBe(false);
  });

  it("rejects duplicate IDs and dangling references", () => {
    const invalid = {
      ...validScenario,
      objects: [...validScenario.objects, validScenario.objects[0]],
      clues: [{ ...validScenario.clues[0], sourceObjectId: "missing-object" }],
    };
    const result = scenarioSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects references to undefined roles", () => {
    const invalid = {
      ...validScenario,
      clues: [{ ...validScenario.clues[0], visibility: { kind: "role", roleIds: ["ghost"] } }],
    };
    expect(scenarioSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects actions that target undefined objects or mechanisms", () => {
    const invalid = {
      ...validScenario,
      actions: [{ id: "bad-action", kind: "inspect-object", label: "Inspect", targetObjectId: "missing" }],
    };
    expect(scenarioSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects unknown required roles", () => {
    expect(scenarioSchema.safeParse({ ...validScenario, requiredRoleIds: ["ghost", "operator"] }).success).toBe(false);
  });

  it("rejects a single required role and duplicate required roles", () => {
    expect(scenarioSchema.safeParse({ ...validScenario, requiredRoleIds: ["operator"] }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...validScenario, requiredRoleIds: ["operator", "operator"] }).success).toBe(false);
  });

  it("rejects undeclared keys to keep scenario data versioned and explicit", () => {
    expect(scenarioSchema.safeParse({ ...validScenario, surprise: true }).success).toBe(false);
  });
});
