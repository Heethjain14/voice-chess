import { applyPhoneticCorrections } from "./phoneticMap";
import { closestMatch } from "./textMatch";

export interface ParsedMove {
  piece: "p" | "n" | "b" | "r" | "q" | "k";
  target: string;
  capture: boolean;
  castle?: "kingside" | "queenside";
  promotion?: "q" | "r" | "b" | "n";
}

const PIECE_ALIASES: Record<ParsedMove["piece"], string[]> = {
  p: ["pawn", "pawns"],
  n: ["knight", "knights"],
  b: ["bishop", "bishops"],
  r: ["rook", "rooks"],
  q: ["queen", "queens"],
  k: ["king", "kings"],
};

const PROMOTION_ALIASES: Record<"q" | "r" | "b" | "n", string[]> = {
  q: ["queen", "queens"],
  r: ["rook", "rooks"],
  b: ["bishop", "bishops"],
  n: ["knight", "knights"],
};

const CAPTURE_WORDS = [
  "capture",
  "captures",
  "capturing",
  "take",
  "takes",
  "taking",
];
const CASTLE_WORDS = ["castle", "castling"];
const QUEENSIDE_WORDS = ["queenside", "long"];
const KINGSIDE_WORDS = ["kingside", "short"];

const VOCABULARY = [
  ...Object.values(PIECE_ALIASES).flat(),
  ...CAPTURE_WORDS,
  ...CASTLE_WORDS,
  ...QUEENSIDE_WORDS,
  ...KINGSIDE_WORDS,
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function isSquare(token: string): boolean {
  return /^[a-h][1-8]$/.test(token);
}

function correctToken(token: string): string {
  if (VOCABULARY.includes(token)) return token;
  if (isSquare(token)) return token;
  if (/^[a-h]$/.test(token) || /^[1-8]$/.test(token)) return token;

  return closestMatch(token, VOCABULARY, 2) ?? token;
}

function mergeSquareTokens(tokens: string[]): string[] {
  const merged: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];

    if (/^[a-h]$/.test(current) && next && /^[1-8]$/.test(next)) {
      merged.push(current + next);
      i++;
      continue;
    }

    merged.push(current);
  }

  return merged;
}

export function parseMove(text: string): ParsedMove | null {
  const rawTokens = tokenize(text);
  const phoneticTokens = applyPhoneticCorrections(rawTokens);
  const correctedTokens = phoneticTokens.map(correctToken);
  const tokens = mergeSquareTokens(correctedTokens);

  const hasAny = (words: string[]) => tokens.some((t) => words.includes(t));

  if (hasAny(CASTLE_WORDS)) {
    const castle = hasAny(QUEENSIDE_WORDS) ? "queenside" : "kingside";
    return { piece: "k", target: "", capture: false, castle };
  }

  const targetIndex = tokens.findIndex(isSquare);
  if (targetIndex === -1) return null;
  const target = tokens[targetIndex];

  const beforeTarget = tokens.slice(0, targetIndex);
  const afterTarget = tokens.slice(targetIndex + 1);

  let piece: ParsedMove["piece"] = "p";
  for (const [symbol, aliases] of Object.entries(PIECE_ALIASES)) {
    if (beforeTarget.some((t) => aliases.includes(t))) {
      piece = symbol as ParsedMove["piece"];
      break;
    }
  }

  const capture = hasAny(CAPTURE_WORDS);

  let promotion: ParsedMove["promotion"] | undefined;
  for (const [symbol, aliases] of Object.entries(PROMOTION_ALIASES)) {
    if (afterTarget.some((t) => aliases.includes(t))) {
      promotion = symbol as ParsedMove["promotion"];
      break;
    }
  }

  return promotion
    ? { piece, target, capture, promotion }
    : { piece, target, capture };
}