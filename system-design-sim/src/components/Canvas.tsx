"use client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export default function Canvas() {
  return (
    // The inline minHeight guarantees the DOM allocates 600px immediately
    <div style={{ height: "100%", width: "100%", minHeight: "600px" }}>
      <Excalidraw theme="light" />
    </div>
  );
}
