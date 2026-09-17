export const BRIDGE_CHANNEL = "voice-chess-bridge";

export interface BoardStatePayload {
  fen: string;
  gameOver: boolean;
}

export type BridgeRequest =
  | { channel: typeof BRIDGE_CHANNEL; id: string; type: "GET_STATE" }
  | {
      channel: typeof BRIDGE_CHANNEL;
      id: string;
      type: "PLAY_MOVE";
      from: string;
      to: string;
      promotion?: "q" | "r" | "b" | "n";
    };

export type BridgeResponse =
  | ({
      channel: typeof BRIDGE_CHANNEL;
      id: string;
      ok: true;
    } & BoardStatePayload)
  | { channel: typeof BRIDGE_CHANNEL; id: string; ok: false; error: string };

export function isBridgeResponse(data: unknown): data is BridgeResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === BRIDGE_CHANNEL &&
    typeof (data as { id?: unknown }).id === "string"
  );
}
