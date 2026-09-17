export interface SpeechResult {
  transcript: string;
  confidence: number;
}

type SpeechCallback = (results: SpeechResult[]) => void;
type ErrorCallback = (error: string) => void;

export class SpeechRecognizer {
  private recognition: any;
  private listening = false;
  private onResult: SpeechCallback;
  private onError: ErrorCallback;

  constructor(onResult: SpeechCallback, onError: ErrorCallback) {
    this.onResult = onResult;
    this.onError = onError;
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
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event: any) => {
      const alternatives = event.results[0];
      const results: SpeechResult[] = [];

      for (let i = 0; i < alternatives.length; i++) {
        results.push({
          transcript: alternatives[i].transcript,
          confidence: alternatives[i].confidence,
        });
      }

      this.onResult(results);
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
    if (this.listening) {
      return;
    }

    this.listening = true;

    try {
      this.recognition.start();
    } catch (error) {
      this.listening = false;
      this.onError("Could not start speech recognition.");
    }
  }

  stop() {
    if (!this.listening) {
      return;
    }

    this.recognition.stop();
    this.listening = false;
  }

  isListening() {
    return this.listening;
  }
}