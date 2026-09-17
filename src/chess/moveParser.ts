export interface ParsedMove {
  piece: "p" | "n" | "b" | "r" | "q" | "k";
  target: string;
  capture: boolean;
  castle?: "kingside" | "queenside";
}

const pieceAliases: Record<
  ParsedMove["piece"],
  string[]
> = {
  p: ["pawn", "pawns"],
  n: ["knight", "knights", "night", "nights"],
  b: ["bishop", "bishops"],
  r: ["rook", "rooks"],
  q: ["queen", "queens"],
  k: ["king", "kings"],
};

export function parseMove(
  text: string
): ParsedMove | null {

  // ----------------------------------
  // Normalize speech recognition text
  // ----------------------------------

  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  console.log(
    "Normalized speech:",
    normalized
  );

  // ----------------------------------
  // Castling
  // ----------------------------------

  if (
    normalized.includes("castle") ||
    normalized.includes("castling")
  ) {

    if (
      normalized.includes("queen") ||
      normalized.includes("long")
    ) {
      return {
        piece: "k",
        target: "",
        capture: false,
        castle: "queenside",
      };
    }

    return {
      piece: "k",
      target: "",
      capture: false,
      castle: "kingside",
    };
  }

  // ----------------------------------
  // Find target square
  // ----------------------------------

  const squareMatch = normalized.match(
    /\b([a-h][1-8])\b/
  );

  if (!squareMatch) {
    console.log(
      "No chess square detected."
    );

    return null;
  }

  const target = squareMatch[1];

  // ----------------------------------
  // Determine piece
  // ----------------------------------

  let piece: ParsedMove["piece"] = "p";

  for (
    const [symbol, aliases] of Object.entries(
      pieceAliases
    )
  ) {

    const found = aliases.some(
      (alias) =>
        normalized.includes(alias)
    );

    if (found) {
      piece =
        symbol as ParsedMove["piece"];

      break;
    }
  }

  // ----------------------------------
  // Detect captures
  // ----------------------------------

  const capture =
    normalized.includes("capture") ||
    normalized.includes("captures") ||
    normalized.includes("takes") ||
    normalized.includes("take") ||
    normalized.includes("capturing");

  // ----------------------------------
  // Return parsed move
  // ----------------------------------

  const result: ParsedMove = {
    piece,
    target,
    capture,
  };

  console.log(
    "Parsed chess command:",
    result
  );

  return result;
}