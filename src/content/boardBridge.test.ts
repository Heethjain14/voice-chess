import { describe, expect, it, vi } from "vitest";
import { BRIDGE_CHANNEL } from "./bridgeProtocol";
import { getBoardState, playMove } from "./boardBridge";

function respondToNextRequest(
  build: (id: string) => Record<string, unknown>
) {
  const spy = vi
    .spyOn(window, "postMessage")
    .mockImplementation((message: unknown) => {
      spy.mockRestore();
      const id = (message as { id: string }).id;
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent("message", { data: build(id), source: window })
        );
      });
    });
}

describe("boardBridge", () => {
  it("resolves board state from a successful GET_STATE response", async () => {
    respondToNextRequest((id) => ({
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id,
      ok: true,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      gameOver: false,
    }));

    const state = await getBoardState();

    expect(state.turn).toBe("b");
    expect(state.gameOver).toBe(false);
  });

  it("resolves the updated state after playing a move", async () => {
    respondToNextRequest((id) => ({
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id,
      ok: true,
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      gameOver: false,
    }));

    const state = await playMove("e2", "e4");

    expect(state.fen).toContain("4P3");
    expect(state.turn).toBe("b");
  });

  it("rejects with the bridge error message on failure", async () => {
    respondToNextRequest((id) => ({
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id,
      ok: false,
      error: "wc-chess-board API not found on this page.",
    }));

    await expect(playMove("e2", "e4")).rejects.toThrow(
      "wc-chess-board API not found on this page."
    );
  });
});
