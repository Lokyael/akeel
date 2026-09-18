import type { ShellWord } from "../language";

export type OptionArity = "flag" | "required" | "optional-attached";
export type OptionValueForm = "separate" | "equals" | "attached";

export type OptionSpec<Key extends string = string> = Readonly<{
  readonly key: Key;
  readonly names: readonly string[];
  readonly arity?: OptionArity;
  readonly forms?: readonly OptionValueForm[];
}>;

export type SegmentContract<Key extends string = string> = Readonly<{
  readonly options: readonly OptionSpec<Key>[];
  readonly matchExtraOption?: (token: ShellWord) => { readonly key: Key; readonly name: string } | undefined;
}>;

export type SegmentParseOptions = Readonly<{
  readonly stopAtFirstOperand?: boolean;
  readonly interspersed?: boolean;
}>;

export type ParsedOption<Key extends string = string> =
  | Readonly<{
      readonly kind: "flag";
      readonly key: Key;
      readonly name: string;
      readonly token: ShellWord;
    }>
  | Readonly<{
      readonly kind: "valued";
      readonly key: Key;
      readonly name: string;
      readonly token: ShellWord;
      readonly value: ShellWord;
    }>;

export type SegmentResult<Key extends string = string> =
  | Readonly<{
      readonly kind: "complete";
      readonly options: readonly ParsedOption<Key>[];
      readonly operands: readonly ShellWord[];
      readonly pathspecOperands: readonly ShellWord[];
      readonly remainder: readonly ShellWord[];
    }>
  | Readonly<{
      readonly kind: "indeterminate";
      readonly reason: "unknown-option";
      readonly word: ShellWord;
      readonly options: readonly ParsedOption<Key>[];
      readonly operands: readonly ShellWord[];
      readonly remainder: readonly ShellWord[];
    }>
  | Readonly<{
      readonly kind: "malformed";
      readonly reason: "missing-value" | "unsupported-form";
      readonly word: ShellWord;
    }>;

function optionValuePathKind(token: ShellWord, value: string): ShellWord["pathKind"] {
  if (token.pathKind === "home-relative") return "home-relative";
  return value === "~" || value.startsWith("~/") ? "literal" : token.pathKind;
}

function createValuedWord(token: ShellWord, text: string, start: number): ShellWord {
  return Object.freeze({
    text,
    start,
    end: start + text.length,
    quote: token.quote,
    pathKind: optionValuePathKind(token, text),
  });
}

export function parseSegment<Key extends string = string>(
  words: readonly ShellWord[],
  contract: SegmentContract<Key>,
  parseOptions: SegmentParseOptions = {},
): SegmentResult<Key> {
  const specByName = new Map<string, OptionSpec<Key>>();
  for (const spec of contract.options) {
    for (const name of spec.names) {
      specByName.set(name, spec);
    }
  }

  const options: ParsedOption<Key>[] = [];
  const operands: ShellWord[] = [];
  const pathspecOperands: ShellWord[] = [];

  const interspersed = parseOptions.interspersed ?? true;
  const stopAtFirstOperand = parseOptions.stopAtFirstOperand ?? false;

  let index = 0;
  let operandsOnly = false;

  while (index < words.length) {
    const token = words[index]!;

    if (operandsOnly) {
      if (token.text === "--") {
        for (let restIdx = index + 1; restIdx < words.length; restIdx += 1) {
          pathspecOperands.push(words[restIdx]!);
        }
        break;
      }
      operands.push(token);
      index += 1;
      continue;
    }

    if (token.text === "--") {
      for (let restIdx = index + 1; restIdx < words.length; restIdx += 1) {
        pathspecOperands.push(words[restIdx]!);
      }
      break;
    }

    if (!token.text.startsWith("-") || token.text === "-") {
      operands.push(token);
      if (stopAtFirstOperand) {
        return Object.freeze({
          kind: "complete" as const,
          options: Object.freeze(options),
          operands: Object.freeze(operands),
          pathspecOperands: Object.freeze(pathspecOperands),
          remainder: Object.freeze(words.slice(index + 1)),
        });
      }
      if (!interspersed) {
        operandsOnly = true;
      }
      index += 1;
      continue;
    }

    if (contract.matchExtraOption !== undefined) {
      const extra = contract.matchExtraOption(token);
      if (extra !== undefined) {
        options.push(Object.freeze({
          kind: "flag" as const,
          key: extra.key,
          name: extra.name,
          token,
        }));
        index += 1;
        continue;
      }
    }

    // Long options (--foo or --foo=bar)
    if (token.text.startsWith("--")) {
      const equalsIdx = token.text.indexOf("=");
      const name = equalsIdx >= 0 ? token.text.slice(0, equalsIdx) : token.text;
      const attachedValue = equalsIdx >= 0 ? token.text.slice(equalsIdx + 1) : undefined;

      const spec = specByName.get(name);
      if (spec === undefined) {
        return Object.freeze({
          kind: "indeterminate" as const,
          reason: "unknown-option" as const,
          word: token,
          options: Object.freeze(options),
          operands: Object.freeze(operands),
          remainder: Object.freeze(words.slice(index)),
        });
      }

      const arity = spec.arity ?? "flag";
      const forms = spec.forms ?? (arity === "required" ? ["separate", "equals", "attached"] : ["separate"]);

      if (arity === "flag") {
        if (attachedValue !== undefined) {
          return Object.freeze({ kind: "malformed" as const, reason: "unsupported-form" as const, word: token });
        }
        options.push(Object.freeze({ kind: "flag" as const, key: spec.key, name, token }));
        index += 1;
        continue;
      }

      if (arity === "required") {
        if (attachedValue !== undefined) {
          if (!forms.includes("equals")) {
            return Object.freeze({ kind: "malformed" as const, reason: "unsupported-form" as const, word: token });
          }
          if (attachedValue.length === 0) {
            return Object.freeze({ kind: "malformed" as const, reason: "missing-value" as const, word: token });
          }
          const valWord = createValuedWord(token, attachedValue, token.start + equalsIdx + 1);
          options.push(Object.freeze({ kind: "valued" as const, key: spec.key, name, token, value: valWord }));
          index += 1;
          continue;
        }

        // Separated value
        if (!forms.includes("separate")) {
          return Object.freeze({ kind: "malformed" as const, reason: "unsupported-form" as const, word: token });
        }
        const nextWord = words[index + 1];
        if (nextWord === undefined || (nextWord.text.startsWith("-") && nextWord.text !== "-")) {
          return Object.freeze({ kind: "malformed" as const, reason: "missing-value" as const, word: token });
        }
        options.push(Object.freeze({ kind: "valued" as const, key: spec.key, name, token, value: nextWord }));
        index += 2;
        continue;
      }

      if (arity === "optional-attached") {
        if (attachedValue !== undefined) {
          const valWord = createValuedWord(token, attachedValue, token.start + equalsIdx + 1);
          options.push(Object.freeze({ kind: "valued" as const, key: spec.key, name, token, value: valWord }));
        } else {
          options.push(Object.freeze({ kind: "flag" as const, key: spec.key, name, token }));
        }
        index += 1;
        continue;
      }
    }

    // Short options (-v, -vf, -Cdir, -C=dir, etc.)
    const clusterText = token.text.slice(1);
    let offset = 0;

    while (offset < clusterText.length) {
      const char = clusterText[offset]!;
      const shortName = `-${char}`;
      const spec = specByName.get(shortName);

      if (spec === undefined) {
        return Object.freeze({
          kind: "indeterminate" as const,
          reason: "unknown-option" as const,
          word: token,
          options: Object.freeze(options),
          operands: Object.freeze(operands),
          remainder: Object.freeze(words.slice(index)),
        });
      }

      const arity = spec.arity ?? "flag";
      const forms = spec.forms ?? (arity === "required" ? ["separate", "equals", "attached"] : ["separate"]);

      if (arity === "flag") {
        options.push(Object.freeze({ kind: "flag" as const, key: spec.key, name: shortName, token }));
        offset += 1;
        continue;
      }

      if (arity === "required") {
        let attachedRest = clusterText.slice(offset + 1);
        if (attachedRest.length > 0) {
          const isEquals = attachedRest.startsWith("=");
          if (isEquals) {
            attachedRest = attachedRest.slice(1);
            if (attachedRest.length === 0) {
              return Object.freeze({ kind: "malformed" as const, reason: "missing-value" as const, word: token });
            }
            if (!forms.includes("equals")) {
              return Object.freeze({ kind: "malformed" as const, reason: "unsupported-form" as const, word: token });
            }
          } else if (!forms.includes("attached")) {
            return Object.freeze({ kind: "malformed" as const, reason: "unsupported-form" as const, word: token });
          }
          const valStart = token.start + 1 + offset + 1 + (isEquals ? 1 : 0);
          const valWord = createValuedWord(token, attachedRest, valStart);
          options.push(Object.freeze({ kind: "valued" as const, key: spec.key, name: shortName, token, value: valWord }));
          break;
        }

        // Separated argument
        if (!forms.includes("separate")) {
          return Object.freeze({ kind: "malformed" as const, reason: "unsupported-form" as const, word: token });
        }
        const nextWord = words[index + 1];
        if (nextWord === undefined || (nextWord.text.startsWith("-") && nextWord.text !== "-")) {
          return Object.freeze({ kind: "malformed" as const, reason: "missing-value" as const, word: token });
        }
        options.push(Object.freeze({ kind: "valued" as const, key: spec.key, name: shortName, token, value: nextWord }));
        index += 1; // will advance another 1 at loop end
        break;
      }

      if (arity === "optional-attached") {
        const attachedRest = clusterText.slice(offset + 1);
        if (attachedRest.length > 0) {
          const isEquals = attachedRest.startsWith("=");
          const actualRest = isEquals ? attachedRest.slice(1) : attachedRest;
          const valStart = token.start + 1 + offset + 1 + (isEquals ? 1 : 0);
          const valWord = createValuedWord(token, actualRest, valStart);
          options.push(Object.freeze({ kind: "valued" as const, key: spec.key, name: shortName, token, value: valWord }));
        } else {
          options.push(Object.freeze({ kind: "flag" as const, key: spec.key, name: shortName, token }));
        }
        break;
      }
    }

    index += 1;
  }

  return Object.freeze({
    kind: "complete" as const,
    options: Object.freeze(options),
    operands: Object.freeze(operands),
    pathspecOperands: Object.freeze(pathspecOperands),
    remainder: Object.freeze([]),
  });
}
