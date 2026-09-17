import { Chess } from "chess.js";
import { ParsedMove } from "./moveParser";

export interface ResolvedMove {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export function resolveMove(
  chess: Chess,
  parsed: ParsedMove
): ResolvedMove[] {

  const legalMoves = chess.moves({
    verbose: true
  });

  // Handle castling later.
  if (parsed.castle) {
    return [];
  }

  return legalMoves
    .filter((move) => {
      return (
        move.piece === parsed.piece &&
        move.to === parsed.target
      );
    })
    .map((move) => ({
      from: move.from,
      to: move.to,
      promotion: move.promotion as
        | "q"
        | "r"
        | "b"
        | "n"
        | undefined
    }));
}