import { Chess } from "chess.js";
import { parseMove } from "../chess/moveParser";
import { resolveMove, type ResolvedMove } from "../chess/moveValidator";

export type VoiceCommandResult =
  | { kind: "PLAY"; move: ResolvedMove }
  | { kind: "ASK_DISAMBIGUATION"; candidates: ResolvedMove[] }
  | { kind: "ERROR"; message: string };

export interface PendingDisambiguation {
  candidates: ResolvedMove[];
}

function describeCandidate(move: ResolvedMove): string {
  return move.from;
}

export function interpretTranscript(
  transcript: string,
  fen: string,
  pending: PendingDisambiguation | null
): VoiceCommandResult {
  if (pending) {
    const squareMatch = transcript.toLowerCase().match(/\b([a-h][1-8])\b/);

    if (squareMatch) {
      const chosen = pending.candidates.filter(
        (move) => move.from === squareMatch[1]
      );

      if (chosen.length === 1) {
        return { kind: "PLAY", move: chosen[0] };
      }
    }

    return {
      kind: "ERROR",
      message: `Please say the square the piece is on: ${pending.candidates
        .map(describeCandidate)
        .join(" or ")}`,
    };
  }

  const parsed = parseMove(transcript);
  if (!parsed) {
    return {
      kind: "ERROR",
      message: `I couldn't understand "${transcript}".`,
    };
  }

  const chess = new Chess();
  chess.load(fen);

  const candidates = resolveMove(chess, parsed);

  if (candidates.length === 0) {
    return {
      kind: "ERROR",
      message: `"${transcript}" isn't a legal move.`,
    };
  }

  if (candidates.length === 1) {
    return { kind: "PLAY", move: candidates[0] };
  }

  return { kind: "ASK_DISAMBIGUATION", candidates };
}

export function interpretTranscripts(
  transcripts: string[],
  fen: string,
  pending: PendingDisambiguation | null
): VoiceCommandResult {
  let firstResult: VoiceCommandResult | null = null;

  for (const transcript of transcripts) {
    const result = interpretTranscript(transcript, fen, pending);

    if (!firstResult) {
      firstResult = result;
    }

    if (result.kind === "PLAY") {
      return result;
    }
  }

  return (
    firstResult ?? {
      kind: "ERROR",
      message: "I couldn't understand that.",
    }
  );
}
