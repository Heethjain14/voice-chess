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
      id: request.id,
      ok: true,
      fen: game.getFEN(),
      gameOver: game.isGameOver(),
    };
  } catch (error) {
    return {
      channel: BRIDGE_CHANNEL,
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown board error.",
    };
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;

  const data = event.data as Partial<BridgeRequest> | undefined;
  if (!data || data.channel !== BRIDGE_CHANNEL) return;

  const response = handleBridgeRequest(
    findBoardGame(),
    data as BridgeRequest
  );
  window.postMessage(response, "*");
});
