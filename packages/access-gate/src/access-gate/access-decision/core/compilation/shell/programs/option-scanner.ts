import type { ShellWord } from "../language";

export type OptionOccurrence = Readonly<{
  readonly name: string;
  readonly token: ShellWord;
  readonly index: number;
  readonly value?: ShellWord;
  readonly valueIndex?: number;
  readonly attached: boolean;
  readonly missingValue: boolean;
}>;

type ScannerOptions = Readonly<{
  readonly valueOptions?: ReadonlySet<string>;
  readonly attachedOptions?: ReadonlySet<string>;
}>;

function optionName(text: string): Readonly<{ readonly name: string; readonly attachedValue?: string }> | undefined {
  if (!text.startsWith("-") || text === "-") return undefined;
  const equals = text.indexOf("=");
  if (equals > 0) return { name: text.slice(0, equals), attachedValue: text.slice(equals + 1) };
  return { name: text };
}

function attachedOption(text: string, options: ReadonlySet<string>): Readonly<{ readonly name: string; readonly value: string }> | undefined {
  for (const option of options) {
    if (text.startsWith(option) && text.length > option.length) {
      return { name: option, value: text.slice(option.length) };
    }
  }
  return undefined;
}

export function scanOptionWords(
  words: readonly ShellWord[],
  options: ScannerOptions = {},
): readonly OptionOccurrence[] {
  const occurrences: OptionOccurrence[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index]!;
    if (token.text === "--") break;
    const attached = attachedOption(token.text, options.attachedOptions ?? new Set());
    const valueOptions = options.valueOptions ?? new Set();
    if (attached !== undefined) {
      occurrences.push(Object.freeze({
        name: attached.name,
        token,
        index,
        value: Object.freeze({ ...token, text: attached.value }),
        valueIndex: index,
        attached: true,
        missingValue: false,
      }));
      continue;
    }
    const parsed = optionName(token.text);
    if (parsed === undefined) continue;
    if (parsed.attachedValue !== undefined) {
      const missingValue = parsed.attachedValue.length === 0;
      occurrences.push(Object.freeze({
        name: parsed.name,
        token,
        index,
        value: missingValue ? undefined : Object.freeze({ ...token, text: parsed.attachedValue }),
        valueIndex: missingValue ? undefined : index,
        attached: true,
        missingValue,
      }));
      continue;
    }
    const candidate = valueOptions.has(parsed.name) ? words[index + 1] : undefined;
    const missingValue = valueOptions.has(parsed.name) &&
      (candidate === undefined || candidate.text.startsWith("-"));
    const value = missingValue ? undefined : candidate;
    occurrences.push(Object.freeze({
      name: parsed.name,
      token,
      index,
      value,
      valueIndex: value === undefined ? undefined : index + 1,
      attached: false,
      missingValue,
    }));
    if (value !== undefined) index += 1;
  }
  return Object.freeze(occurrences);
}

export function firstNonOptionWord(
  words: readonly ShellWord[],
  valueOptions: ReadonlySet<string> = new Set(),
): ShellWord | undefined {
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (word.text === "--") return words[index + 1];
    if (!word.text.startsWith("-")) return word;
    const parsed = optionName(word.text);
    if (parsed !== undefined && parsed.attachedValue === undefined && valueOptions.has(parsed.name) &&
      words[index + 1] !== undefined && !words[index + 1]!.text.startsWith("-")) index += 1;
  }
  return undefined;
}

export function hasUnknownOption(
  words: readonly ShellWord[],
  knownOptions: ReadonlySet<string>,
  valueOptions: ReadonlySet<string> = new Set(),
): boolean {
  return scanOptionWords(words, { valueOptions }).some((occurrence) => occurrence.missingValue || !knownOptions.has(occurrence.name));
}
