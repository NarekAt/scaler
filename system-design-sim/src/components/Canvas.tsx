"use client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

interface CanvasProps {
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
}

export default function Canvas({ onApiReady }: CanvasProps) {
  return (
    <div style={{ height: "100%", width: "100%", minHeight: "600px" }}>
      <Excalidraw theme="light" excalidrawAPI={onApiReady} />
    </div>
  );
}
