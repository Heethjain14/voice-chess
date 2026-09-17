import type { Chess } from "chess.js";
import type { ParsedMove } from "./moveParser";

export interface ResolvedMove {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export function resolveMove(
  chess: Chess,
  parsed: ParsedMove
): ResolvedMove[] {
  const legalMoves = chess.moves({ verbose: true });

  if (parsed.castle) {
    const flag = parsed.castle === "queenside" ? "q" : "k";

    return legalMoves
      .filter((move) => move.piece === "k" && move.flags.includes(flag))
      .map((move) => ({ from: move.from, to: move.to, promotion: undefined }));
  }

  let candidates = legalMoves.filter(
    (move) => move.piece === parsed.piece && move.to === parsed.target
  );

  if (parsed.capture) {
    const capturing = candidates.filter((move) => move.flags.includes("c"));
    if (capturing.length > 0) {
      candidates = capturing;
    }
  }

  if (parsed.promotion) {
    candidates = candidates.filter(
      (move) => move.promotion === parsed.promotion
    );
  }

  return candidates.map((move) => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion as "q" | "r" | "b" | "n" | undefined,
  }));
}