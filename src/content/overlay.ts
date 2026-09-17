import { SpeechRecognizer } from "../voice/speechRecognizer";
import { getBoardState, playMove } from "./boardBridge";
import {
  interpretTranscripts,
  type PendingDisambiguation,
} from "./voiceController";

const HOST_ID = "voice-chess-overlay-host";

export function mountOverlay(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "fixed";
  host.style.bottom = "24px";
  host.style.right = "24px";
  host.style.zIndex = "999999";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .panel {
      font-family: Arial, sans-serif;
      background: #1e1e1e;
      color: #fff;
      border-radius: 12px;
      padding: 12px 16px;
      width: 260px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }
    .mic {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      background: #4caf50;
      color: #fff;
    }
    .mic.listening {
      background: #e53935;
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      min-height: 32px;
      white-space: pre-wrap;
    }
  `;
  shadow.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";

  const button = document.createElement("button");
  button.className = "mic";
  button.textContent = "\u{1F399} Speak Move";

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "Ready";

  panel.appendChild(button);
  panel.appendChild(status);
  shadow.appendChild(panel);

  let pending: PendingDisambiguation | null = null;

  const setStatus = (text: string) => {
    status.textContent = text;
  };

  const setListening = (listening: boolean) => {
    button.classList.toggle("listening", listening);
    button.textContent = listening ? "⏹ Stop" : "\u{1F399} Speak Move";
  };

  let recognizer: SpeechRecognizer;

  try {
    recognizer = new SpeechRecognizer(
      async (results) => {
        setListening(false);
        setStatus(`Heard: "${results[0].transcript}"`);

        try {
          const boardState = await getBoardState();
          const outcome = interpretTranscripts(
            results.map((r) => r.transcript),
            boardState.fen,
            pending
          );

          if (outcome.kind === "PLAY") {
            pending = null;
            await playMove(
              outcome.move.from,
              outcome.move.to,
              outcome.move.promotion
            );
            setStatus(`Played ${outcome.move.from} to ${outcome.move.to}`);
          } else if (outcome.kind === "ASK_DISAMBIGUATION") {
            pending = { candidates: outcome.candidates };
            setStatus(
              `Which one? ${outcome.candidates
                .map((m) => m.from)
                .join(" or ")}`
            );
          } else {
            pending = null;
            setStatus(outcome.message);
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Board error.");
        }
      },
      (error) => {
        setListening(false);
        setStatus(`Speech error: ${error}`);
      }
    );
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : "Speech recognition is not supported in this browser."
    );
    button.disabled = true;
    return;
  }

  button.addEventListener("click", () => {
    if (recognizer.isListening()) {
      recognizer.stop();
      setListening(false);
    } else {
      setStatus("Listening...");
      setListening(true);
      recognizer.start();
    }
  });
}
