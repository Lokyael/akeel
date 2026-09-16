import type { ShellWord } from "../language";

export type BoundedOptionValueKind = "path" | "pattern" | "scalar" | "enum";
export type BoundedOptionForm = "separate" | "equals" | "attached";
export type BoundedOptionDisposition = "allow" | "unsupported" | "security-boundary";

export type BoundedOptionSpec = Readonly<{
  readonly names: readonly string[];
  readonly value?: BoundedOptionValueKind;
  readonly forms?: readonly BoundedOptionForm[];
  readonly optionalValue?: boolean;
  readonly disposition?: BoundedOptionDisposition;
}>;

export type BoundedOptionContract = Readonly<{
  readonly options: readonly BoundedOptionSpec[];
}>;

export type ParsedBoundedOption = Readonly<{
  readonly name: string;
  readonly token: ShellWord;
  readonly value?: ShellWord;
  readonly valueKind?: BoundedOptionValueKind;
}>;

export type BoundedOptionParseResult =
  | Readonly<{
      readonly kind: "complete";
      readonly options: readonly ParsedBoundedOption[];
      readonly operands: readonly ShellWord[];
    }>
  | Readonly<{
      readonly kind: "reject";
      readonly code: "unsupported-syntax" | "security-boundary";
      readonly word: ShellWord;
    }>;

type BoundedOptionRejection = Extract<BoundedOptionParseResult, { readonly kind: "reject" }>;

type BoundedOptionValue = BoundedOptionRejection | ParsedBoundedOption;

function isRejection(value: BoundedOptionValue): value is BoundedOptionRejection {
  return "kind" in value && value.kind === "reject";
}

function isOptionList(value: BoundedOptionRejection | readonly ParsedBoundedOption[]): value is readonly ParsedBoundedOption[] {
  return Array.isArray(value);
}

function rejection(code: BoundedOptionRejection["code"], word: ShellWord): BoundedOptionRejection {
  return Object.freeze({ kind: "reject" as const, code, word });
}

function optionValueWord(token: ShellWord, text: string): ShellWord {
  return Object.freeze({ ...token, text });
}

function formsFor(spec: BoundedOptionSpec): readonly BoundedOptionForm[] {
  if (spec.forms !== undefined) return spec.forms;
  return spec.value === undefined ? [] : ["separate"];
}

function specByName(contract: BoundedOptionContract): ReadonlyMap<string, BoundedOptionSpec> {
  const result = new Map<string, BoundedOptionSpec>();
  for (const spec of contract.options) {
    for (const name of spec.names) result.set(name, spec);
  }
  return result;
}

function rejectForSpec(spec: BoundedOptionSpec, token: ShellWord): BoundedOptionRejection | undefined {
  if (spec.disposition === "unsupported") return rejection("unsupported-syntax", token);
  if (spec.disposition === "security-boundary") return rejection("security-boundary", token);
  return undefined;
}

function parseValue(
  spec: BoundedOptionSpec,
  name: string,
  token: ShellWord,
  value: ShellWord | undefined,
): BoundedOptionValue {
  const rejected = rejectForSpec(spec, token);
  if (rejected !== undefined) return rejected;
  if (spec.value === undefined || value === undefined || value.text === "--") {
    return rejection("unsupported-syntax", token);
  }
  return Object.freeze({
    name,
    token,
    value,
    valueKind: spec.value,
  });
}

function parseNamedOption(
  args: readonly ShellWord[],
  index: number,
  name: string,
  attachedValue: string | undefined,
  attachedForm: "equals" | "attached" | undefined,
  spec: BoundedOptionSpec,
): Readonly<{ readonly result: BoundedOptionValue; readonly consumed: number }> {
  const token = args[index]!;
  const forms = formsFor(spec);
  if (spec.value === undefined) {
    const rejected = rejectForSpec(spec, token);
    if (rejected !== undefined) return { result: rejected, consumed: 0 };
    if (attachedValue !== undefined || !forms.includes("separate")) {
      return { result: rejection("unsupported-syntax", token), consumed: 0 };
    }
    return { result: Object.freeze({ name, token }), consumed: 0 };
  }

  if (attachedValue !== undefined) {
    if (attachedForm === undefined || !forms.includes(attachedForm) || attachedValue.length === 0) {
      return { result: rejection("unsupported-syntax", token), consumed: 0 };
    }
    return { result: parseValue(spec, name, token, optionValueWord(token, attachedValue)), consumed: 0 };
  }
  if (!forms.includes("separate")) {
    if (spec.optionalValue === true) return { result: Object.freeze({ name, token }), consumed: 0 };
    return { result: rejection("unsupported-syntax", token), consumed: 0 };
  }
  const value = args[index + 1];
  if (value === undefined || value.text === "--") {
    return { result: rejection("unsupported-syntax", token), consumed: 0 };
  }
  return { result: parseValue(spec, name, token, value), consumed: 1 };
}

function shortSpec(
  token: ShellWord,
  specs: ReadonlyMap<string, BoundedOptionSpec>,
): Readonly<{ readonly name: string; readonly spec: BoundedOptionSpec; readonly attachedValue?: string }> | undefined {
  let selected: Readonly<{ readonly name: string; readonly spec: BoundedOptionSpec; readonly attachedValue?: string }> | undefined;
  for (const [name, spec] of specs) {
    if (!name.startsWith("-") || name.startsWith("--") || token.text === name) continue;
    const forms = formsFor(spec);
    if (spec.value !== undefined && forms.includes("attached") && token.text.startsWith(name) && token.text.length > name.length) {
      if (selected === undefined || name.length > selected.name.length) {
        selected = { name, spec, attachedValue: token.text.slice(name.length) };
      }
    }
  }
  return selected;
}

function parseShortCluster(
  token: ShellWord,
  next: ShellWord | undefined,
  specs: ReadonlyMap<string, BoundedOptionSpec>,
): Readonly<{ readonly result: BoundedOptionRejection | readonly ParsedBoundedOption[]; readonly consumesNext: boolean }> {
  const options: ParsedBoundedOption[] = [];
  const text = token.text.slice(1);
  for (let offset = 0; offset < text.length; offset += 1) {
    const name = `-${text[offset]}`;
    const spec = specs.get(name);
    if (spec === undefined) return { result: rejection("unsupported-syntax", token), consumesNext: false };
    const rejected = rejectForSpec(spec, token);
    if (rejected !== undefined) return { result: rejected, consumesNext: false };
    const forms = formsFor(spec);
    if (spec.value === undefined) {
      if (!forms.includes("attached") && !forms.includes("separate")) {
        return { result: rejection("unsupported-syntax", token), consumesNext: false };
      }
      options.push(Object.freeze({ name, token }));
      continue;
    }
    const remainder = text.slice(offset + 1);
    if (remainder.length > 0) {
      if (!forms.includes("attached")) return { result: rejection("unsupported-syntax", token), consumesNext: false };
      const value = optionValueWord(token, remainder);
      options.push(Object.freeze({ name, token, value, valueKind: spec.value }));
      return { result: Object.freeze(options), consumesNext: false };
    }
    if (!forms.includes("separate")) {
      if (spec.optionalValue === true) {
        options.push(Object.freeze({ name, token }));
        continue;
      }
      return { result: rejection("unsupported-syntax", token), consumesNext: false };
    }
    if (next === undefined || next.text === "--") {
      return { result: rejection("unsupported-syntax", token), consumesNext: false };
    }
    options.push(Object.freeze({ name, token, value: next, valueKind: spec.value }));
    return { result: Object.freeze(options), consumesNext: true };
  }
  return { result: Object.freeze(options), consumesNext: false };
}

export function parseBoundedOptions(
  args: readonly ShellWord[],
  contract: BoundedOptionContract,
): BoundedOptionParseResult {
  const specs = specByName(contract);
  const options: ParsedBoundedOption[] = [];
  const operands: ShellWord[] = [];
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (optionsEnded || token.text === "-") {
      operands.push(token);
      continue;
    }
    if (token.text === "--") {
      optionsEnded = true;
      continue;
    }
    if (!token.text.startsWith("-")) {
      operands.push(token);
      continue;
    }

    const equals = token.text.indexOf("=");
    if (token.text.startsWith("--")) {
      const name = equals > 0 ? token.text.slice(0, equals) : token.text;
      const spec = specs.get(name);
      if (spec === undefined) return rejection("unsupported-syntax", token) as Extract<BoundedOptionParseResult, { readonly kind: "reject" }>;
      const parsed = parseNamedOption(args, index, name, equals > 0 ? token.text.slice(equals + 1) : undefined, equals > 0 ? "equals" : undefined, spec);
      if (isRejection(parsed.result)) return parsed.result;
      options.push(parsed.result);
      index += parsed.consumed;
      continue;
    }

    const exact = specs.get(token.text);
    if (exact !== undefined) {
      const parsed = parseNamedOption(args, index, token.text, undefined, undefined, exact);
      if (isRejection(parsed.result)) return parsed.result;
      options.push(parsed.result);
      index += parsed.consumed;
      continue;
    }

    const attached = shortSpec(token, specs);
    if (attached !== undefined) {
      const parsed = parseNamedOption(args, index, attached.name, attached.attachedValue, "attached", attached.spec);
      if (isRejection(parsed.result)) return parsed.result;
      options.push(parsed.result);
      continue;
    }

    const cluster = parseShortCluster(token, args[index + 1], specs);
    if (isOptionList(cluster.result)) {
      options.push(...cluster.result);
      if (cluster.consumesNext) index += 1;
      continue;
    }
    return cluster.result;
  }

  return Object.freeze({ kind: "complete" as const, options: Object.freeze(options), operands: Object.freeze(operands) });
}
