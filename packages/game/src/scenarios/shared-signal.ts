/**
 * Server-owned scenario content. Do not import this module into browser code:
 * it contains accepted answers and the complete hidden puzzle graph.
 */
export const sharedSignalScenario = {
  schemaVersion: 1,
  id: "shared-signal",
  title: "PARALLAX: The Shared Signal",
  description:
    "A damaged relay has isolated a remote settlement. Two operators must combine system diagnostics and intercepted transmissions to restore the network before the station loses power.",
  durationSeconds: 480,
  startingEnergy: 100,
  requiredRoleIds: ["systems", "signals"],
  perspectives: [
    {
      id: "systems",
      name: "Systems Operator",
      description:
        "You can read the relay's internal diagnostics, power sequencing, and restoration controls.",
      visibleObjectIds: [
        "relay-console",
        "diagnostic-terminal",
        "frequency-lock",
        "restoration-array",
      ],
      visibleClueIds: ["power-phase", "pulse-cadence", "restoration-sequence"],
      usableMechanismIds: ["frequency-lock", "network-auth", "relay-restoration"],
    },
    {
      id: "signals",
      name: "Signal Analyst",
      description:
        "You can decode intercepted transmissions, routing echoes, and network authentication data.",
      visibleObjectIds: [
        "relay-console",
        "signal-receiver",
        "frequency-lock",
        "network-node",
      ],
      visibleClueIds: ["carrier-offset", "routing-echo", "relay-polarity"],
      usableMechanismIds: ["frequency-lock", "network-auth", "relay-restoration"],
    },
  ],
  objects: [
    {
      id: "relay-console",
      name: "Relay Control Console",
      description:
        "The central console is still powered, but its restoration controls are locked behind a frequency handshake.",
      areaId: "control-room",
      inspectable: true,
      interactable: true,
      visibility: { kind: "shared" },
    },
    {
      id: "diagnostic-terminal",
      name: "Systems Diagnostic Terminal",
      description:
        "A diagnostic display containing the relay's phase and pulse timing. Only the Systems Operator can read its protected output.",
      areaId: "control-room",
      inspectable: true,
      interactable: false,
      visibility: { kind: "role", roleIds: ["systems"] },
    },
    {
      id: "signal-receiver",
      name: "Intercept Receiver",
      description:
        "A receiver buffer contains fragments of the settlement's last transmission. Only the Signal Analyst can decode the protected stream.",
      areaId: "control-room",
      inspectable: true,
      interactable: false,
      visibility: { kind: "role", roleIds: ["signals"] },
    },
    {
      id: "frequency-lock",
      name: "Frequency Lock",
      description:
        "A three-part frequency lock. The inputs must be assembled from separate diagnostic and transmission sources.",
      areaId: "control-room",
      inspectable: true,
      interactable: true,
      visibility: { kind: "shared" },
    },
    {
      id: "network-node",
      name: "Hidden Network Node",
      description:
        "A concealed routing node exposed only after the frequency handshake succeeds.",
      areaId: "relay-sublevel",
      inspectable: true,
      interactable: true,
      visibility: { kind: "shared" },
    },
    {
      id: "restoration-array",
      name: "Relay Restoration Array",
      description:
        "The final control array requires the relay sequence and authenticated network route.",
      areaId: "relay-sublevel",
      inspectable: true,
      interactable: true,
      visibility: { kind: "shared" },
    },
  ],
  clues: [
    {
      id: "power-phase",
      title: "Power Phase",
      content:
        "The relay's diagnostic bus reports a stable phase value of 3. This value belongs in the frequency handshake.",
      sourceObjectId: "diagnostic-terminal",
      visibility: { kind: "role", roleIds: ["systems"] },
    },
    {
      id: "pulse-cadence",
      title: "Pulse Cadence",
      content:
        "The diagnostic trace shows one pulse per cycle. The cadence digit is 1.",
      sourceObjectId: "diagnostic-terminal",
      visibility: { kind: "role", roleIds: ["systems"] },
    },
    {
      id: "carrier-offset",
      title: "Carrier Offset",
      content:
        "The intercepted carrier is shifted by seven units. The offset digit is 7.",
      sourceObjectId: "signal-receiver",
      visibility: { kind: "role", roleIds: ["signals"] },
    },
    {
      id: "routing-echo",
      title: "Routing Echo",
      content:
        "A repeating voice fragment resolves to the network route name: NORTHSTAR.",
      sourceObjectId: "signal-receiver",
      visibility: { kind: "role", roleIds: ["signals"] },
      prerequisites: [{ kind: "mechanism-solved", mechanismId: "frequency-lock" }],
    },
    {
      id: "restoration-sequence",
      title: "Restoration Sequence",
      content:
        "The internal recovery note specifies the ordered relay sequence: phase 3, offset 7, cadence 1, checksum 9.",
      sourceObjectId: "diagnostic-terminal",
      visibility: { kind: "role", roleIds: ["systems"] },
      prerequisites: [{ kind: "mechanism-solved", mechanismId: "network-auth" }],
    },
    {
      id: "relay-polarity",
      title: "Relay Polarity",
      content:
        "The intercepted return signal confirms the restoration array must use positive polarity. This is a verbal confirmation, not an extra code digit.",
      sourceObjectId: "signal-receiver",
      visibility: { kind: "role", roleIds: ["signals"] },
    },
  ],
  mechanisms: [
    {
      id: "frequency-lock",
      name: "Synchronize Frequency",
      description:
        "Combine the carrier offset, power phase, and pulse cadence to synchronize the relay.",
      prerequisites: [
        { kind: "all", requirements: [
          { kind: "clue-discovered", clueId: "carrier-offset" },
          { kind: "clue-discovered", clueId: "power-phase" },
          { kind: "clue-discovered", clueId: "pulse-cadence" },
        ] },
      ],
      acceptedAnswers: ["7-3-1", "731"],
      failedAttemptEnergyCost: 5,
      unlockObjectIds: ["network-node"],
    },
    {
      id: "network-auth",
      name: "Authenticate Hidden Network",
      description:
        "Use the routing echo to authenticate the newly exposed network node.",
      prerequisites: [
        { kind: "all", requirements: [
          { kind: "mechanism-solved", mechanismId: "frequency-lock" },
          { kind: "clue-discovered", clueId: "routing-echo" },
        ] },
      ],
      acceptedAnswers: ["NORTHSTAR"],
      failedAttemptEnergyCost: 8,
      unlockObjectIds: ["restoration-array"],
    },
    {
      id: "relay-restoration",
      name: "Restore Relay",
      description:
        "Enter the recovery sequence and confirm positive polarity to restore the settlement link.",
      prerequisites: [
        { kind: "all", requirements: [
          { kind: "mechanism-solved", mechanismId: "network-auth" },
          { kind: "clue-discovered", clueId: "restoration-sequence" },
          { kind: "clue-discovered", clueId: "relay-polarity" },
        ] },
      ],
      acceptedAnswers: ["3-7-1-9", "3719"],
      failedAttemptEnergyCost: 10,
      unlockObjectIds: [],
    },
  ],
  actions: [
    { id: "inspect-relay-console", kind: "inspect-object", label: "Inspect relay console", targetObjectId: "relay-console" },
    { id: "inspect-diagnostic-terminal", kind: "inspect-object", label: "Read diagnostic terminal", targetObjectId: "diagnostic-terminal" },
    { id: "inspect-signal-receiver", kind: "inspect-object", label: "Decode intercepted signal", targetObjectId: "signal-receiver" },
    { id: "synchronize-frequency", kind: "attempt-mechanism", label: "Synchronize frequency", targetMechanismId: "frequency-lock" },
    { id: "inspect-network-node", kind: "inspect-object", label: "Inspect hidden network node", targetObjectId: "network-node", prerequisites: [{ kind: "mechanism-solved", mechanismId: "frequency-lock" }] },
    { id: "authenticate-network", kind: "attempt-mechanism", label: "Authenticate network", targetMechanismId: "network-auth" },
    { id: "inspect-restoration-array", kind: "inspect-object", label: "Inspect restoration array", targetObjectId: "restoration-array", prerequisites: [{ kind: "mechanism-solved", mechanismId: "network-auth" }] },
    { id: "restore-relay", kind: "attempt-mechanism", label: "Restore relay", targetMechanismId: "relay-restoration" },
  ],
  failureConditions: ["timeout", "energy-depleted"],
  winCondition: [{ kind: "mechanism-solved", mechanismId: "relay-restoration" }],
} as const;
