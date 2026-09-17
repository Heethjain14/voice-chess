import { afterEach, describe, expect, it, vi } from "vitest";
import "./pageBridge";
import { getBoardState, playMove } from "./boardBridge";

// jsdom's window.postMessage never populates `event.source` for same-window
// delivery (see node_modules/jsdom/lib/jsdom/browser/Window.js, which has a
// literal `// TODO: event.source - requires reference to incumbent window`
// next to its postMessage implementation). Real Chrome always sets
// event.source === window for same-window postMessage, so both
// pageBridge.ts and boardBridge.ts rely on that as a (no-op, in a real
// browser) sanity check. Without compensating for it here, neither of the
// real listeners under test would ever fire in jsdom, and this test could
// never observe the real request/response interaction (or the Finding 1
// bug) at all.
//
// This spy does NOT fake the request/response protocol, the message
// content, or which listener responds to what — it only re-delivers the
// exact same message via a real `window.dispatchEvent` with `source: window`
// added, through a task-queued (setTimeout) callback to mirror the real,
// asynchronous, task-based delivery `postMessage` uses in every browser.
// Every other behavior (which listeners fire, in what order, how they
// interpret the message, whether they echo back to themselves) is exercised
// for real, using the real code in pageBridge.ts and boardBridge.ts.
function installSourceCorrectedPostMessage() {
  return vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: message, source: window })
      );
    }, 0);
  });
}

interface FakeGame {
  getFEN: () => string;
  isGameOver: () => boolean;
  move: (move: { from: string; to: string; promotion?: string }) => unknown;
}

function installFakeBoard(game: FakeGame) {
  const board = document.createElement("wc-chess-board") as Element & {
    game?: FakeGame;
  };
  board.game = game;
  document.body.appendChild(board);
  return board;
}

describe("bridge integration (real listeners, real postMessage delivery)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("resolves getBoardState() with the fake board's real state", async () => {
    installSourceCorrectedPostMessage();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    installFakeBoard({
      getFEN: () => fen,
      isGameOver: () => false,
      move: vi.fn(),
    });

    const state = await getBoardState();

    expect(state.fen).toBe(fen);
    expect(state.turn).toBe("b");
    expect(state.gameOver).toBe(false);
  });

  it("calls the fake board's move() with the right args and resolves updated state", async () => {
    installSourceCorrectedPostMessage();
    const move = vi.fn();
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    installFakeBoard({
      getFEN: () => fen,
      isGameOver: () => false,
      move,
    });

    const state = await playMove("e2", "e4");

    expect(move).toHaveBeenCalledWith({
      from: "e2",
      to: "e4",
      promotion: undefined,
    });
    expect(state.fen).toBe(fen);
    expect(state.turn).toBe("b");
  });

  it("does not loop: postMessage is called exactly twice per request/response cycle", async () => {
    const spy = installSourceCorrectedPostMessage();
    const fen = "8/8/8/8/8/8/8/8 w - - 0 1";
    installFakeBoard({
      getFEN: () => fen,
      isGameOver: () => false,
      move: vi.fn(),
    });

    await getBoardState();

    expect(spy).toHaveBeenCalledTimes(2);

    // Wait a couple of ticks to make sure nothing keeps firing afterwards
    // (i.e. no infinite self-echo loop from pageBridge.ts).
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
