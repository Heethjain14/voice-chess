export const BRIDGE_CHANNEL = "voice-chess-bridge";

export interface BoardStatePayload {
  fen: string;
  gameOver: boolean;
}

export type BridgeRequest =
  | {
      channel: typeof BRIDGE_CHANNEL;
      kind: "request";
      id: string;
      type: "GET_STATE";
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      kind: "request";
      id: string;
      type: "PLAY_MOVE";
      from: string;
      to: string;
      promotion?: "q" | "r" | "b" | "n";
    };

export type BridgeResponse =
  | ({
      channel: typeof BRIDGE_CHANNEL;
      kind: "response";
      id: string;
      ok: true;
    } & BoardStatePayload)
  | {
      channel: typeof BRIDGE_CHANNEL;
      kind: "response";
      id: string;
      ok: false;
      error: string;
    };

// Same-window postMessage delivers every message back to every listener on
// that window, including the sender's own listener (per the HTML spec).
// `kind` lets each side tell "a request I should answer" apart from "a
// response I'm waiting on" apart from "my own message echoing back to me",
// which channel + id alone cannot do (a BridgeRequest also has a channel and
// a string id).
export function isBridgeResponse(data: unknown): data is BridgeResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === BRIDGE_CHANNEL &&
    (data as { kind?: unknown }).kind === "response" &&
    typeof (data as { id?: unknown }).id === "string"
  );
}
