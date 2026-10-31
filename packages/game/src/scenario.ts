import { z } from "zod";

const id = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const nonEmptyText = z.string().trim().min(1).max(4_000);
const timestampFreeNumber = z.number().finite();

export const discoveryVisibilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shared") }).strict(),
  z.object({ kind: z.literal("player"), playerIds: z.array(id).min(1) }).strict(),
  z.object({ kind: z.literal("role"), roleIds: z.array(id).min(1) }).strict(),
]);

export const prerequisiteSchema: z.ZodType<PrerequisiteInput> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("clue-discovered"),
      clueId: id,
      by: z.enum(["any-player", "same-player", "different-player"]).optional(),
    }).strict(),
    z.object({ kind: z.literal("object-discovered"), objectId: id }).strict(),
    z.object({ kind: z.literal("mechanism-solved"), mechanismId: id }).strict(),
    z.object({ kind: z.literal("all"), requirements: z.array(prerequisiteSchema).min(1) }).strict(),
    z.object({ kind: z.literal("any"), requirements: z.array(prerequisiteSchema).min(1) }).strict(),
  ]),
);

export type PrerequisiteInput =
  | { kind: "clue-discovered"; clueId: string; by?: "any-player" | "same-player" | "different-player" }
  | { kind: "object-discovered"; objectId: string }
  | { kind: "mechanism-solved"; mechanismId: string }
  | { kind: "all" | "any"; requirements: PrerequisiteInput[] };

const objectSchema = z.object({
  id,
  name: nonEmptyText,
  description: nonEmptyText,
  areaId: id,
  inspectable: z.boolean().default(true),
  interactable: z.boolean().default(false),
  visibility: discoveryVisibilitySchema.default({ kind: "shared" }),
}).strict();

const perspectiveSchema = z.object({
  id,
  name: nonEmptyText,
  description: nonEmptyText,
  visibleObjectIds: z.array(id),
  visibleClueIds: z.array(id),
  usableMechanismIds: z.array(id),
}).strict();

const clueSchema = z.object({
  id,
  title: nonEmptyText,
  content: nonEmptyText,
  sourceObjectId: id,
  visibility: discoveryVisibilitySchema,
  prerequisites: z.array(prerequisiteSchema).default([]),
}).strict();

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("inspect-object"), label: nonEmptyText, targetObjectId: id, prerequisites: z.array(prerequisiteSchema).default([]) }).strict(),
  z.object({ id, kind: z.literal("attempt-mechanism"), label: nonEmptyText, targetMechanismId: id, prerequisites: z.array(prerequisiteSchema).default([]) }).strict(),
]);

const mechanismSchema = z.object({
  id,
  name: nonEmptyText,
  description: nonEmptyText,
  prerequisites: z.array(prerequisiteSchema).default([]),
  /** Kept server-side; never serialize this field to a player client. */
  acceptedAnswers: z.array(z.string().trim().min(1).max(200)).min(1),
  failedAttemptEnergyCost: z.number().int().min(0).max(100),
  maxAttempts: z.number().int().positive().max(100).optional(),
  unlockObjectIds: z.array(id).default([]),
}).strict();

export const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  title: nonEmptyText,
  description: nonEmptyText,
  durationSeconds: z.number().int().min(60).max(3_600),
  startingEnergy: z.number().int().min(1).max(10_000),
  perspectives: z.array(perspectiveSchema).min(2).max(6),
  objects: z.array(objectSchema).min(1),
  clues: z.array(clueSchema),
  mechanisms: z.array(mechanismSchema),
  winCondition: z.array(prerequisiteSchema).min(1),
}).strict().superRefine((scenario, ctx) => {
  const checkUnique = (items: readonly { id: string }[], label: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: [label, index, "id"], message: `Duplicate ${label.slice(0, -1)} id: ${item.id}` });
      seen.add(item.id);
    });
  };
  checkUnique(scenario.perspectives, "perspectives");
  checkUnique(scenario.objects, "objects");
  checkUnique(scenario.clues, "clues");
  checkUnique(scenario.mechanisms, "mechanisms");

  const roles = new Set(scenario.perspectives.map((item) => item.id));
  const objects = new Set(scenario.objects.map((item) => item.id));
  const clues = new Set(scenario.clues.map((item) => item.id));
  const mechanisms = new Set(scenario.mechanisms.map((item) => item.id));\n  checkUnique(scenario.actions, "actions");
  const checkVisibility = (visibility: z.infer<typeof discoveryVisibilitySchema>, path: (string | number)[]) => {
    if (visibility.kind === "role") visibility.roleIds.forEach((roleId) => {
      if (!roles.has(roleId)) ctx.addIssue({ code: "custom", path, message: `Unknown role id: ${roleId}` });
    });
  };

  const checkPrerequisite = (requirement: PrerequisiteInput, path: (string | number)[]) => {
    if (requirement.kind === "clue-discovered" && !clues.has(requirement.clueId)) ctx.addIssue({ code: "custom", path, message: `Unknown clue id: ${requirement.clueId}` });
    if (requirement.kind === "object-discovered" && !objects.has(requirement.objectId)) ctx.addIssue({ code: "custom", path, message: `Unknown object id: ${requirement.objectId}` });
    if (requirement.kind === "mechanism-solved" && !mechanisms.has(requirement.mechanismId)) ctx.addIssue({ code: "custom", path, message: `Unknown mechanism id: ${requirement.mechanismId}` });
    if (requirement.kind === "all" || requirement.kind === "any") requirement.requirements.forEach((child, index) => checkPrerequisite(child, [...path, index]));
  };

  scenario.objects.forEach((item, index) => checkVisibility(item.visibility, ["objects", index, "visibility"]));
  scenario.clues.forEach((item, index) => {
    if (!objects.has(item.sourceObjectId)) ctx.addIssue({ code: "custom", path: ["clues", index, "sourceObjectId"], message: `Unknown source object: ${item.sourceObjectId}` });
    checkVisibility(item.visibility, ["clues", index, "visibility"]);
    item.prerequisites.forEach((requirement, requirementIndex) => checkPrerequisite(requirement, ["clues", index, "prerequisites", requirementIndex]));
  });
  scenario.mechanisms.forEach((item, index) => {
    item.unlockObjectIds.forEach((objectId) => {
      if (!objects.has(objectId)) ctx.addIssue({ code: "custom", path: ["mechanisms", index, "unlockObjectIds"], message: `Unknown unlock object: ${objectId}` });
    });
    item.prerequisites.forEach((requirement, requirementIndex) => checkPrerequisite(requirement, ["mechanisms", index, "prerequisites", requirementIndex]));
  });
  scenario.perspectives.forEach((item, index) => {
    item.visibleObjectIds.forEach((objectId) => {
      if (!objects.has(objectId)) ctx.addIssue({ code: "custom", path: ["perspectives", index, "visibleObjectIds"], message: `Unknown visible object: ${objectId}` });
    });
    item.visibleClueIds.forEach((clueId) => {
      if (!clues.has(clueId)) ctx.addIssue({ code: "custom", path: ["perspectives", index, "visibleClueIds"], message: `Unknown visible clue: ${clueId}` });
    });
    item.usableMechanismIds.forEach((mechanismId) => {
      if (!mechanisms.has(mechanismId)) ctx.addIssue({ code: "custom", path: ["perspectives", index, "usableMechanismIds"], message: `Unknown usable mechanism: ${mechanismId}` });
    });
  });
  scenario.actions.forEach((action, index) => {\n    if (action.kind === "inspect-object" && !objects.has(action.targetObjectId)) ctx.addIssue({ code: "custom", path: ["actions", index, "targetObjectId"], message: `Unknown action object: ${action.targetObjectId}` });\n    if (action.kind === "attempt-mechanism" && !mechanisms.has(action.targetMechanismId)) ctx.addIssue({ code: "custom", path: ["actions", index, "targetMechanismId"], message: `Unknown action mechanism: ${action.targetMechanismId}` });\n    action.prerequisites.forEach((requirement, requirementIndex) => checkPrerequisite(requirement, ["actions", index, "prerequisites", requirementIndex]));\n  });\n  scenario.winCondition.forEach((requirement, index) => checkPrerequisite(requirement, ["winCondition", index]));
});

export type ScenarioDefinition = z.infer<typeof scenarioSchema>;
