declare module "@earendil-works/pi-tui" {
  // pi-keel 只消费宽度/截断助手（T-050 A3b）；其余导出（Box/Text 等组件）不声明。
  export function visibleWidth(text: string): number;
  export function truncateToWidth(text: string, maxWidth: number, ellipsis?: string, pad?: boolean): string;
}
