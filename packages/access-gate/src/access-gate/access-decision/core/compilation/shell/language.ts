export type ShellQuoteMode = "bare" | "single" | "double" | "escaped";
export type ShellPathKind = "home-relative" | "literal";


export type ShellWord = Readonly<{
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly quote: ShellQuoteMode;
  readonly pathKind?: ShellPathKind;
}>;

export type ShellWordScan =
  | Readonly<{ kind: "complete"; words: readonly ShellWord[] }>
  | Readonly<{
      kind: "reject";
      code: "dynamic-value" | "unsupported-syntax";
      anchor: Readonly<{ start: number; end: number }>;
      resourceClass: "syntax";
    }>;

function rejected(
  code: "dynamic-value" | "unsupported-syntax",
  start: number,
  end: number,
): ShellWordScan {
  return Object.freeze({
    kind: "reject",
    code,
    anchor: Object.freeze({ start, end }),
    resourceClass: "syntax",
  });
}

function finishWord(
  words: ShellWord[],
  text: string,
  start: number,
  end: number,
  quote: ShellQuoteMode,
  tildePrefix: boolean,
): void {
  const word: { text: string; start: number; end: number; quote: ShellQuoteMode; pathKind?: ShellPathKind } = {
    text,
    start,
    end,
    quote,
  };
  if (text === "~" || text.startsWith("~/")) word.pathKind = tildePrefix ? "home-relative" : "literal";
  words.push(Object.freeze(word));
}

export function scanShellWords(input: string): ShellWordScan {
  const words: ShellWord[] = [];
  let index = 0;

  while (index < input.length) {
    if (isForbiddenControlCharacter(input[index]!)) return rejected("unsupported-syntax", index, index + 1);
    while (index < input.length && /\s/u.test(input[index]!)) {
      if (isForbiddenControlCharacter(input[index]!)) return rejected("unsupported-syntax", index, index + 1);
      index += 1;
    }
    if (index === input.length) break;

    const start = index;
    const tildePrefix = input[index] === "~";
    let text = "";
    let mode: ShellQuoteMode = "bare";
    let quote: "single" | "double" | undefined;
    let escaped = false;

    while (index < input.length) {
      const character = input[index]!;
      if (isForbiddenControlCharacter(character)) return rejected("unsupported-syntax", index, index + 1);
      if (quote === "single") {
        if (character === "'") {
          quote = undefined;
        } else {
          text += character;
        }
        index += 1;
        continue;
      }
      if (quote === "double") {
        if (character === '"') {
          quote = undefined;
          index += 1;
          continue;
        }
        if (character === "\\") {
          if (index + 1 >= input.length) return rejected("unsupported-syntax", start, input.length);
          if (isForbiddenControlCharacter(input[index + 1]!)) return rejected("unsupported-syntax", index, index + 2);
          const next = input[index + 1]!;
          if (next === "$" || next === "`" || next === '"' || next === "\\") text += next;
          else text += `\\${next}`;
          escaped = true;
          index += 2;
          continue;
        }
        if (character === "$" || character === "`") {
          return rejected("dynamic-value", start, findWordEnd(input, start));
        }
        text += character;
        index += 1;
        continue;
      }

      if (character === "\n") return rejected("unsupported-syntax", index, index + 1);
      if (/\s/u.test(character)) break;
      if (character === "(" || character === ")" || character === "{" || character === "}") {
        return rejected("unsupported-syntax", start, findWordEnd(input, start));
      }
      const unsupportedRedirection = unsupportedRedirectionLength(input, index, text.length);
      if (unsupportedRedirection > 0) {
        return rejected("unsupported-syntax", index, index + unsupportedRedirection);
      }
      const operatorLength = shellOperatorLength(input, index, text.length);
      if (operatorLength > 0) {
        if (text.length > 0) break;
        text = input.slice(index, index + operatorLength);
        index += operatorLength;
        break;
      }
      if (character === "'") {
        if (text.length === 0 && mode === "bare") mode = "single";
        quote = "single";
        index += 1;
        continue;
      }
      if (character === '"') {
        if (text.length === 0 && mode === "bare") mode = "double";
        quote = "double";
        index += 1;
        continue;
      }
      if (character === "\\") {
        if (index + 1 >= input.length) return rejected("unsupported-syntax", start, input.length);
        if (isForbiddenControlCharacter(input[index + 1]!)) return rejected("unsupported-syntax", index, index + 2);
        text += input[index + 1]!;
        escaped = true;
        index += 2;
        continue;
      }
      if (character === "$" || character === "`") {
        return rejected("dynamic-value", start, findWordEnd(input, start));
      }
      if (character === "*" || character === "?" || character === "[") {
        return rejected("dynamic-value", start, findWordEnd(input, start));
      }
      text += character;
      index += 1;
    }

    if (quote !== undefined) return rejected("unsupported-syntax", start, input.length);
    if (text.length === 0) return rejected("unsupported-syntax", start, index);
    if (mode === "bare" && text.startsWith("~") && text !== "~" && !text.startsWith("~/")) {
      return rejected("unsupported-syntax", start, index);
    }
    if (escaped && mode === "bare") mode = "escaped";
    finishWord(words, text, start, index, mode, tildePrefix);
  }

  return Object.freeze({ kind: "complete", words: Object.freeze(words) });
}

function isForbiddenControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 0x20 && code !== 0x09 || code === 0x7f;
}

function unsupportedRedirectionLength(input: string, index: number, textLength: number): number {
  const pair = input.slice(index, index + 2);
  if (pair === "<<" || pair === ">|" || pair === ">&" || pair === "<&") {
    return input.slice(index, index + 3) === "<<<" ? 3 : 2;
  }
  if (textLength === 0) {
    const character = input[index]!;
    if (character >= "0" && character <= "9") {
      let cursor = index;
      while (cursor < input.length && input[cursor]! >= "0" && input[cursor]! <= "9") {
        cursor += 1;
      }
      const next = input.slice(cursor, cursor + 2);
      if (next.startsWith(">") || next.startsWith("<")) {
        if (next.startsWith(">&")) {
          const isTwo = cursor === index + 1 && input[index] === "2";
          if (isTwo && input.slice(index, index + 4) === "2>&1") {
            const after = input[index + 4];
            if (after === undefined || /[\s;&|<>]/.test(after)) {
              return 0;
            }
            return 4;
          }
          let end = cursor + 2;
          while (end < input.length && !/[\s;&|<>]/.test(input[end]!)) {
            end += 1;
          }
          return end - index;
        }
        const opSuffix = next.startsWith(">>") || next.startsWith("<>") ? 2 : 1;
        const opToken = input.slice(index, cursor + opSuffix);
        if (opToken === "0<" || opToken === "1>" || opToken === "1>>" || opToken === "2>" || opToken === "2>>" || opToken === "2<>") {
          return 0;
        }
        return cursor - index + opSuffix;
      }
    }
  }
  return 0;
}

function shellOperatorLength(input: string, index: number, textLength: number): number {
  if (textLength === 0) {
    if (input.startsWith("2>&1", index)) {
      const next = input[index + 4];
      if (next === undefined || /[\s;&|<>]/.test(next)) {
        return 4;
      }
    }
    const triple = input.slice(index, index + 3);
    if (triple === "1>>" || triple === "2>>" || triple === "2<>") return 3;
    const pair = input.slice(index, index + 2);
    if (pair === "0<" || pair === "1>" || pair === "2>") {
      if (input[index + 2] !== "&") return 2;
    }
  }
  const pair = input.slice(index, index + 2);
  if (pair === "&&" || pair === "||" || pair === ">>" || pair === "<>") return 2;
  return "|;&<>".includes(input[index]!) ? 1 : 0;
}

function findWordEnd(input: string, start: number): number {
  let index = start;
  let quote: string | undefined;
  while (index < input.length) {
    const character = input[index]!;
    if (quote === undefined && /\s/u.test(character)) break;
    if (quote === undefined && (character === "'" || character === '"')) quote = character;
    else if (quote !== undefined && character === quote) quote = undefined;
    index += 1;
  }
  return index;
}
