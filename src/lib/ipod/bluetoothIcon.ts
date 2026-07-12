export const BT_ICON_STORAGE_KEY = "slvr-bluetooth-icon-pixels";

export const DEFAULT_BT_PIXELS = [
  "000000100000000",
  "000000110000000",
  "000000101000000",
  "001000100100000",
  "000100100010000",
  "000010100100000",
  "000001101000000",
  "000000110000000",
  "000001101000000",
  "000010100100000",
  "000100100010000",
  "001000100100000",
  "000000101000000",
  "000000110000000",
  "000000100000000",
];

export type PixelGrid = string[];

export function isValidPixelGrid(value: unknown): value is PixelGrid {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row) => typeof row === "string" && /^[01]+$/.test(row))
  );
}

export function normalizePixelGrid(pixels: PixelGrid): PixelGrid {
  const cols = Math.max(...pixels.map((row) => row.length));
  return pixels.map((row) => row.padEnd(cols, "0"));
}

export function pixelGridToBooleans(pixels: PixelGrid): boolean[][] {
  const normalized = normalizePixelGrid(pixels);
  return normalized.map((row) => [...row].map((c) => c === "1"));
}

export function booleansToPixelGrid(grid: boolean[][]): PixelGrid {
  return grid.map((row) => row.map((on) => (on ? "1" : "0")).join(""));
}

export function emptyPixelGrid(rows: number, cols: number): PixelGrid {
  return Array.from({ length: rows }, () => "0".repeat(cols));
}

export function getBluetoothPixels(): PixelGrid {
  if (typeof window === "undefined") return DEFAULT_BT_PIXELS;
  try {
    const raw = localStorage.getItem(BT_ICON_STORAGE_KEY);
    if (!raw) return DEFAULT_BT_PIXELS;
    const parsed: unknown = JSON.parse(raw);
    if (isValidPixelGrid(parsed)) return normalizePixelGrid(parsed);
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_BT_PIXELS;
}

export function setBluetoothPixels(pixels: PixelGrid): void {
  localStorage.setItem(
    BT_ICON_STORAGE_KEY,
    JSON.stringify(normalizePixelGrid(pixels)),
  );
}

export function pixelsToTypeScript(pixels: PixelGrid): string {
  const lines = normalizePixelGrid(pixels)
    .map((row) => `  "${row}",`)
    .join("\n");
  return `const BT_PIXELS = [\n${lines}\n];`;
}
