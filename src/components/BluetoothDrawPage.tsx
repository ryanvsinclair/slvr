"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  booleansToPixelGrid,
  DEFAULT_BT_PIXELS,
  emptyPixelGrid,
  getBluetoothPixels,
  isValidPixelGrid,
  normalizePixelGrid,
  pixelGridToBooleans,
  pixelsToTypeScript,
  setBluetoothPixels,
  type PixelGrid,
} from "@/lib/ipod/bluetoothIcon";

type Tool = "paint" | "erase";

const LCD_BG = "#c9d2bd";
const LCD_FG = "#0d120c";

function drawWifiIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = LCD_FG;
  ctx.fillStyle = LCD_FG;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  const wy = y + 10;
  const wMid = x + 4;
  ctx.fillRect(wMid - 1, wy - 2, 2, 2);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const r = 3.5 + i * 3.5;
    ctx.arc(wMid, wy, r, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
  }
}

function drawBatteryIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = LCD_FG;
  ctx.strokeStyle = LCD_FG;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y + 2, 22, 12);
  ctx.fillRect(x + 22, y + 5, 3, 6);
  ctx.fillRect(x + 2, y + 4, 14, 8);
}

function drawPixelIcon(
  ctx: CanvasRenderingContext2D,
  pixels: PixelGrid,
  x: number,
  y: number,
  scale = 1,
) {
  const normalized = normalizePixelGrid(pixels);
  ctx.fillStyle = LCD_FG;
  for (let r = 0; r < normalized.length; r++) {
    for (let c = 0; c < normalized[r].length; c++) {
      if (normalized[r][c] === "1") {
        ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      }
    }
  }
}

function drawStatusBarPreview(
  canvas: HTMLCanvasElement,
  pixels: PixelGrid,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = 302;
  const h = 26;
  canvas.width = w;
  canvas.height = h;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = LCD_BG;
  ctx.fillRect(0, 0, w, h);

  drawWifiIcon(ctx, 6, 8);
  drawPixelIcon(ctx, pixels, 19, 9, 1);
  drawBatteryIcon(ctx, w - 32, 6);
}

function drawZoomPreview(
  canvas: HTMLCanvasElement,
  pixels: PixelGrid,
  scale: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const normalized = normalizePixelGrid(pixels);
  const cols = normalized[0]?.length ?? 0;
  const rows = normalized.length;
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = LCD_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawPixelIcon(ctx, pixels, 0, 0, scale);
}

export default function BluetoothDrawPage() {
  const [grid, setGrid] = useState<boolean[][]>(() =>
    pixelGridToBooleans(DEFAULT_BT_PIXELS),
  );
  const [tool, setTool] = useState<Tool>("paint");
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState("");
  const [importText, setImportText] = useState("");
  const statusBarRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);

  const pixels = useMemo(() => booleansToPixelGrid(grid), [grid]);
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length;
  const exportText = useMemo(() => pixelsToTypeScript(pixels), [pixels]);

  useEffect(() => {
    setGrid(pixelGridToBooleans(getBluetoothPixels()));
  }, []);

  useEffect(() => {
    if (statusBarRef.current) drawStatusBarPreview(statusBarRef.current, pixels);
    if (zoomRef.current) drawZoomPreview(zoomRef.current, pixels, 8);
  }, [pixels]);

  const applyCell = useCallback(
    (row: number, col: number, value: boolean) => {
      setGrid((prev) => {
        if (prev[row]?.[col] === value) return prev;
        const next = prev.map((r) => [...r]);
        next[row][col] = value;
        return next;
      });
    },
    [],
  );

  const paintAt = useCallback(
    (row: number, col: number) => {
      applyCell(row, col, tool === "paint");
    },
    [applyCell, tool],
  );

  const handlePointerDown = (row: number, col: number) => {
    setIsDrawing(true);
    paintAt(row, col);
  };

  const handlePointerEnter = (row: number, col: number) => {
    if (isDrawing) paintAt(row, col);
  };

  useEffect(() => {
    const stop = () => setIsDrawing(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const save = () => {
    setBluetoothPixels(pixels);
    setStatus("Saved — reload /projects to see it on the iPod.");
  };

  const resetDefault = () => {
    setGrid(pixelGridToBooleans(DEFAULT_BT_PIXELS));
    setStatus("Reset to default grid.");
  };

  const clear = () => {
    setGrid((prev) => prev.map((row) => row.map(() => false)));
    setStatus("Grid cleared.");
  };

  const copyExport = async () => {
    await navigator.clipboard.writeText(exportText);
    setStatus("TypeScript copied to clipboard.");
  };

  const importGrid = () => {
    try {
      const parsed: unknown = JSON.parse(importText);
      if (!isValidPixelGrid(parsed)) {
        setStatus("Import failed — expected a JSON array of 0/1 strings.");
        return;
      }
      setGrid(pixelGridToBooleans(parsed));
      setStatus("Imported grid.");
    } catch {
      setStatus("Import failed — invalid JSON.");
    }
  };

  const resize = (nextRows: number, nextCols: number) => {
    const safeRows = Math.max(1, Math.min(24, nextRows));
    const safeCols = Math.max(1, Math.min(24, nextCols));
    setGrid((prev) => {
      const next = emptyPixelGrid(safeRows, safeCols).map((row, r) =>
        [...row].map((_, c) => prev[r]?.[c] ?? false),
      );
      return next;
    });
  };

  return (
    <div className="draw-page">
      <div className="draw-page__inner">
        <h1>Bluetooth icon editor</h1>
        <p className="draw-page__lede">
          Paint the symbol pixel by pixel. Click <strong>Save to iPod</strong>{" "}
          when you&apos;re happy — the projects room reads it from local storage.
          Each cell is one LCD pixel at 1× scale.
        </p>

        <div className="draw-page__layout">
          <section className="draw-panel">
            <h2>Draw</h2>
            <div className="draw-toolbar">
              <button
                type="button"
                className={tool === "paint" ? "is-active" : ""}
                onClick={() => setTool("paint")}
              >
                Paint
              </button>
              <button
                type="button"
                className={tool === "erase" ? "is-active" : ""}
                onClick={() => setTool("erase")}
              >
                Erase
              </button>
              <button type="button" onClick={clear}>
                Clear
              </button>
              <button type="button" onClick={resetDefault}>
                Reset default
              </button>
            </div>

            <div className="draw-grid-wrap">
              <div
                className="draw-grid"
                style={{ gridTemplateColumns: `repeat(${cols}, 28px)` }}
              >
                {grid.map((row, r) =>
                  row.map((on, c) => (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      className={`draw-cell${on ? " is-on" : ""}`}
                      aria-label={`Pixel ${r + 1}, ${c + 1}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handlePointerDown(r, c);
                      }}
                      onPointerEnter={() => handlePointerEnter(r, c)}
                    />
                  )),
                )}
              </div>
            </div>

            <div className="draw-dims">
              <span>Rows {rows}</span>
              <button type="button" onClick={() => resize(rows - 1, cols)}>
                −
              </button>
              <button type="button" onClick={() => resize(rows + 1, cols)}>
                +
              </button>
              <span style={{ marginLeft: 12 }}>Cols {cols}</span>
              <button type="button" onClick={() => resize(rows, cols - 1)}>
                −
              </button>
              <button type="button" onClick={() => resize(rows, cols + 1)}>
                +
              </button>
            </div>
          </section>

          <aside className="draw-panel">
            <h2>Preview</h2>
            <div className="draw-preview">
              <div className="draw-preview__bar">
                <div className="draw-preview__left">
                  <canvas ref={statusBarRef} height={26} />
                </div>
                <span className="draw-preview__title">SLVR</span>
              </div>
              <div className="draw-preview__zoom">
                <canvas ref={zoomRef} />
              </div>
            </div>

            <div className="draw-actions">
              <button type="button" className="primary" onClick={save}>
                Save to iPod
              </button>
              <button type="button" onClick={copyExport}>
                Copy as TypeScript
              </button>
            </div>

            <p className="draw-status">{status}</p>

            <div className="draw-export">
              <h2>Export</h2>
              <textarea readOnly value={exportText} />
            </div>

            <div className="draw-import">
              <h2>Import JSON</h2>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'["00000100000", "00001010000", ...]'}
              />
              <button type="button" onClick={importGrid}>
                Load JSON
              </button>
            </div>
          </aside>
        </div>

        <p className="draw-page__footer">
          <a href="/projects">Open projects room</a> after saving to test on the
          iPod LCD.
        </p>
      </div>
    </div>
  );
}
