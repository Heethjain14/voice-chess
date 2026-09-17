import { describe, expect, it, vi } from "vitest";
import { BRIDGE_CHANNEL } from "./bridgeProtocol";
import { handleBridgeRequest } from "./pageBridge";

describe("handleBridgeRequest", () => {
  it("returns board state for GET_STATE", () => {
    const game = {
      getFEN: () => "8/8/8/8/8/8/8/8 w - - 0 1",
      isGameOver: () => false,
      move: vi.fn(),
    };

    const result = handleBridgeRequest(game, {
      channel: BRIDGE_CHANNEL,
      kind: "request",
      id: "req-1",
      type: "GET_STATE",
    });

    expect(result).toEqual({
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id: "req-1",
      ok: true,
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      gameOver: false,
    });
  });

  it("plays a move and returns the updated state", () => {
    const move = vi.fn();
    const game = {
      getFEN: () => "8/8/8/8/4P3/8/8/8 b - - 0 1",
      isGameOver: () => false,
      move,
    };

    const result = handleBridgeRequest(game, {
      channel: BRIDGE_CHANNEL,
      kind: "request",
      id: "req-2",
      type: "PLAY_MOVE",
      from: "e2",
      to: "e4",
    });

    expect(move).toHaveBeenCalledWith({
      from: "e2",
      to: "e4",
      promotion: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it("returns an error when the board API isn't found", () => {
    const result = handleBridgeRequest(null, {
      channel: BRIDGE_CHANNEL,
      kind: "request",
      id: "req-3",
      type: "GET_STATE",
    });

    expect(result).toEqual({
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id: "req-3",
      ok: false,
      error: "wc-chess-board API not found on this page.",
    });
  });

  it("returns an error when the board API throws", () => {
    const game = {
      getFEN: () => "8/8/8/8/8/8/8/8 w - - 0 1",
      isGameOver: () => false,
      move: () => {
        throw new Error("illegal move");
      },
    };

    const result = handleBridgeRequest(game, {
      channel: BRIDGE_CHANNEL,
      kind: "request",
      id: "req-4",
      type: "PLAY_MOVE",
      from: "e2",
      to: "e5",
    });

    expect(result).toEqual({
      channel: BRIDGE_CHANNEL,
      kind: "response",
      id: "req-4",
      ok: false,
      error: "illegal move",
    });
  });
});
