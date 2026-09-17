export const PHONETIC_CORRECTIONS: Record<string, string> = {
  one: "1",
  won: "1",
  two: "2",
  too: "2",
  three: "3",
  tree: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  be: "b",
  bee: "b",
  sea: "c",
  see: "c",
  night: "knight",
  nite: "knight",
  nights: "knights",
  nites: "knights",
};

export function applyPhoneticCorrections(tokens: string[]): string[] {
  return tokens.map((token) => PHONETIC_CORRECTIONS[token] ?? token);
}
