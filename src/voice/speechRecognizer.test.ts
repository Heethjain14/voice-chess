import { describe, expect, it, vi } from "vitest";
import { SpeechRecognizer } from "./speechRecognizer";

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

describe("SpeechRecognizer", () => {
  it("requests multiple alternatives and forwards them all, in order", () => {
    const instances: FakeSpeechRecognition[] = [];
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      vi.fn(function () {
        const instance = new FakeSpeechRecognition();
        instances.push(instance);
        return instance;
      });

    const onResult = vi.fn();
    const recognizer = new SpeechRecognizer(onResult, vi.fn());
    recognizer.start();

    const instance = instances[0];
    expect(instance.maxAlternatives).toBe(3);

    instance.onresult?.({
      results: [
        [
          { transcript: "knight to f3", confidence: 0.9 },
          { transcript: "night to f3", confidence: 0.4 },
        ],
      ],
    });

    expect(onResult).toHaveBeenCalledWith([
      { transcript: "knight to f3", confidence: 0.9 },
      { transcript: "night to f3", confidence: 0.4 },
    ]);

    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
  });
});
