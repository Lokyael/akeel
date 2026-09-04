export const MAX_DIRECT_TEXT_BYTES = 16_384;
export const MAX_SHELL_COMMAND_BYTES = 16_384;
export const MAX_SHELL_COMMANDS = 128;
export const MAX_SHELL_CWD_STATES = 256;

export function exceedsDirectTextBudget(values: readonly string[]): boolean {
  return exceedsUtf8ByteBudget(values, MAX_DIRECT_TEXT_BYTES);
}

export function exceedsShellCommandBudget(...values: readonly string[]): boolean {
  return exceedsUtf8ByteBudget(values, MAX_SHELL_COMMAND_BYTES);
}

function exceedsUtf8ByteBudget(values: readonly string[], maxBytes: number): boolean {
  let total = 0;
  for (const value of values) {
    for (let index = 0; index < value.length; index++) {
      const unit = value.charCodeAt(index);
      let bytes: number;
      if (unit <= 0x7f) {
        bytes = 1;
      } else if (unit <= 0x7ff) {
        bytes = 2;
      } else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes = 4;
          index++;
        } else {
          bytes = 3;
        }
      } else {
        bytes = 3;
      }
      if (bytes > maxBytes - total) return true;
      total += bytes;
    }
  }
  return false;
}
