import {
  BRIDGE_CHANNEL,
  isBridgeResponse,
  type BridgeResponse,
} from "./bridgeProtocol";

export interface BoardState {
  fen: string;
  turn: "w" | "b";
  gameOver: boolean;
}

function turnFromFen(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function toBoardState(
  response: Extract<BridgeResponse, { ok: true }>
): BoardState {
  return {
    fen: response.fen,
    turn: turnFromFen(response.fen),
    gameOver: response.gameOver,
  };
}

let requestCounter = 0;

type OutgoingRequest =
  | { type: "GET_STATE" }
  | {
      type: "PLAY_MOVE";
      from: string;
      to: string;
      promotion?: "q" | "r" | "b" | "n";
    };

function sendBridgeRequest(
  request: OutgoingRequest,
  timeoutMs = 2000
): Promise<BoardState> {
  const id = `req-${Date.now()}-${requestCounter++}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Board bridge timed out waiting for a response."));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (!isBridgeResponse(event.data) || event.data.id !== id) return;

      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);

      if (event.data.ok) {
        resolve(toBoardState(event.data));
      } else {
        reject(new Error(event.data.error));
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ channel: BRIDGE_CHANNEL, id, ...request }, "*");
  });
}

export function getBoardState(): Promise<BoardState> {
  return sendBridgeRequest({ type: "GET_STATE" });
}

export function playMove(
  from: string,
  to: string,
  promotion?: "q" | "r" | "b" | "n"
): Promise<BoardState> {
  return sendBridgeRequest({ type: "PLAY_MOVE", from, to, promotion });
}
