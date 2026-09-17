import { Chess } from "chess.js";

export class ChessState {
  private chess: Chess;

  constructor() {
    this.chess = new Chess();
  }

  getChess(): Chess {
    return this.chess;
  }

  getFen(): string {
    return this.chess.fen();
  }

  getTurn(): "w" | "b" {
    return this.chess.turn();
  }

  getLegalMoves() {
    return this.chess.moves({
      verbose: true
    });
  }

  makeMove(
    from: string,
    to: string,
    promotion?: "q" | "r" | "b" | "n"
  ) {
    try {
      return this.chess.move({
        from,
        to,
        promotion
      });
    } catch {
      return null;
    }
  }

  reset() {
    this.chess.reset();
  }

  loadFen(fen: string) {
    this.chess.load(fen);
  }
}