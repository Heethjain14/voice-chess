import { useRef, useState } from "react";
import { SpeechRecognizer } from "../voice/speechRecognizer";
import { parseMove } from "../chess/moveParser";
import { ChessState } from "../chess/chessState";
import { resolveMove } from "../chess/moveValidator";

function Popup() {
  // -----------------------------
  // UI state
  // -----------------------------

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [moveStatus, setMoveStatus] = useState("");

  // -----------------------------
  // Persistent objects
  // -----------------------------

  const recognizer = useRef<SpeechRecognizer | null>(null);

  const chessState = useRef(
    new ChessState()
  );

  // -----------------------------
  // Start voice recognition
  // -----------------------------

  const startListening = () => {
    setError("");
    setMoveStatus("");
    setTranscript("");
    setConfidence(null);

    try {
      // Create recognizer only once
      if (!recognizer.current) {
        recognizer.current = new SpeechRecognizer(
          (results) => {
            const result = results[0];

            // -----------------------------
            // 1. Display what user said
            // -----------------------------

            setTranscript(result.transcript);
            setConfidence(result.confidence);
            setListening(false);

            // -----------------------------
            // 2. Convert speech to chess command
            // -----------------------------

            const parsedMove = parseMove(
              result.transcript
            );

            if (!parsedMove) {
              setMoveStatus(
                "❌ I couldn't understand that chess move."
              );

              return;
            }

            // -----------------------------
            // 3. Display parsed command
            // -----------------------------

            console.log(
              "Parsed move:",
              parsedMove
            );

            // -----------------------------
            // 4. Resolve against legal moves
            // -----------------------------

            const possibleMoves = resolveMove(
              chessState.current.getChess(),
              parsedMove
            );

            // -----------------------------
            // 5. No legal moves found
            // -----------------------------

            if (possibleMoves.length === 0) {
              setMoveStatus(
                `❌ Illegal move: ${result.transcript}`
              );

              return;
            }

            // -----------------------------
            // 6. Exactly one legal move
            // -----------------------------

            if (possibleMoves.length === 1) {
              const move = possibleMoves[0];

              setMoveStatus(
                `✓ Legal move: ${move.from} → ${move.to}`
              );

              console.log(
                "Resolved move:",
                move
              );

              return;
            }

            // -----------------------------
            // 7. Multiple possible moves
            // -----------------------------

            const choices = possibleMoves
              .map(
                (move) =>
                  `${move.from} → ${move.to}`
              )
              .join(", ");

            setMoveStatus(
              `⚠️ Ambiguous move. Options: ${choices}`
            );
          },

          // -----------------------------
          // Speech recognition error
          // -----------------------------

          (errorMessage) => {
            console.error(
              "Speech recognition error:",
              errorMessage
            );

            setError(errorMessage);
            setListening(false);
          }
        );
      }

      // -----------------------------
      // Start recognition
      // -----------------------------

      recognizer.current.start();
      setListening(true);

    } catch (error) {
      console.error(
        "Could not start speech recognition:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Speech recognition failed."
      );

      setListening(false);
    }
  };

  // -----------------------------
  // Stop recognition
  // -----------------------------

  const stopListening = () => {
    recognizer.current?.stop();
    setListening(false);
  };

  // -----------------------------
  // Reset chess position
  // -----------------------------

  const resetBoard = () => {
    chessState.current.reset();

    setTranscript("");
    setConfidence(null);
    setMoveStatus("");
    setError("");
  };

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <div className="popup">

      {/* Header */}

      <h2>♟ Voice Chess</h2>

      {/* Listening status */}

      <div className="status">

        <span
          className={`status-dot ${
            listening ? "listening" : ""
          }`}
        />

        <span>
          {listening
            ? "Listening..."
            : "Ready"}
        </span>

      </div>

      {/* Microphone button */}

      <button
        onClick={
          listening
            ? stopListening
            : startListening
        }
      >
        {listening
          ? "⏹ Stop"
          : "🎙 Speak Move"}
      </button>

      {/* Transcript */}

      <div className="result">

        <h3>Heard</h3>

        <p className="transcript">
          {transcript ||
            "Speak a chess move..."}
        </p>

        {/* Confidence */}

        {confidence !== null && (
          <p className="confidence">
            Confidence:{" "}
            {(confidence * 100).toFixed(1)}%
          </p>
        )}

        {/* Move result */}

        {moveStatus && (
          <div className="move-status">
            {moveStatus}
          </div>
        )}

        {/* Error */}

        {error && (
          <p className="error">
            Error: {error}
          </p>
        )}

      </div>

      {/* Reset button */}

      <button
        className="reset-button"
        onClick={resetBoard}
      >
        Reset Position
      </button>

    </div>
  );
}

export default Popup;