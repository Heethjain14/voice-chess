import {
  BRIDGE_CHANNEL,
  type BridgeRequest,
  type BridgeResponse,
} from "./bridgeProtocol";

export interface ChessComGame {
  getFEN(): string;
  isGameOver(): boolean;
  move(move: { from: string; to: string; promotion?: string }): unknown;
}

interface ChessComBoardElement extends Element {
  game?: ChessComGame;
}

export function findBoardGame(): ChessComGame | null {
  const board = document.querySelector<ChessComBoardElement>(
    "wc-chess-board"
  );
  return board?.game ?? null;
}

export function handleBridgeRequest(
  game: ChessComGame | null,
  request: BridgeRequest
): BridgeResponse {
  if (!game) {
    return {
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id: request.id,
      ok: false,
      error: "wc-chess-board API not found on this page.",
    };
  }

  try {
    if (request.type === "PLAY_MOVE") {
      game.move({
        from: request.from,
        to: request.to,
        promotion: request.promotion,
      });
    }

    return {
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id: request.id,
      ok: true,
      fen: game.getFEN(),
      gameOver: game.isGameOver(),
    };
  } catch (error) {
    return {
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown board error.",
    };
  }
}

// Trust boundary: this listener lives in the page's MAIN world, the same
// world chess.com's own scripts and any other extension's injected scripts
// run in. `event.source === window` only proves the message came from this
// same window (true for a self-echoed postMessage too) — postMessage has no
// origin-based way to distinguish "our own overlay" from "some other script
// sharing this window", since they're all nominally the same origin. A
// malicious/buggy script sharing this page could technically post a
// PLAY_MOVE message and have it applied to the real board. We accept this
// as a bounded risk: this is a personal/practice-use accessibility tool, and
// the worst case is an unwanted move on a casual game, not data exposure.
// Building nonce/cryptographic sender authentication would be
// disproportionate to that risk.
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;

  const data = event.data as Partial<BridgeRequest> | undefined;
  if (!data || data.channel !== BRIDGE_CHANNEL || data.kind !== "request") {
    return;
  }

  const response = handleBridgeRequest(
    findBoardGame(),
    data as BridgeRequest
  );
  window.postMessage(response, "*");
});
