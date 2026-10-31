import { ArraySchema, Schema, type } from "@colyseus/schema";

export class PublicPlayerState extends Schema {
  @type("string") id = "";
  @type("string") displayName = "";
  @type("boolean") connected = false;
  @type("boolean") ready = false;
}

export class ParallaxPublicState extends Schema {
  @type("string") phase = "lobby";
  @type("string") roomCode = "";
  @type("string") hostPlayerId = "";
  @type("string") scenarioTitle = "";
  @type("number") energy = 100;
  /** 0 means the game has not started; timestamps are epoch milliseconds. */
  @type("number") deadline = 0;
  @type([PublicPlayerState]) players = new ArraySchema<PublicPlayerState>();
  @type(["string"]) solvedMechanismIds = new ArraySchema<string>();
}
