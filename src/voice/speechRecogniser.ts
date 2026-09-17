export interface SpeechResult {
  transcript: string;
  confidence: number;
}

type SpeechCallback = (result: SpeechResult) => void;
type ErrorCallback = (error: string) => void;

export class SpeechRecognizer {
  private recognition: any;
  private listening = false;

  constructor(
    private onResult: SpeechCallback,
    private onError: ErrorCallback
  ) {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error(
        "Speech recognition is not supported in this browser."
      );
    }

    this.recognition = new SpeechRecognition();

    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event: any) => {
      const result = event.results[0][0];

      this.onResult({
        transcript: result.transcript,
        confidence: result.confidence
      });

      this.listening = false;
    };

    this.recognition.onerror = (event: any) => {
      this.listening = false;
      this.onError(event.error);
    };

    this.recognition.onend = () => {
      this.listening = false;
    };
  }

  start() {
    if (this.listening) return;

    this.listening = true;
    this.recognition.start();
  }

  stop() {
    if (!this.listening) return;

    this.recognition.stop();
    this.listening = false;
  }

  isListening() {
    return this.listening;
  }
}