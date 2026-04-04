"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import Dashboard from "@/components/Dashboard";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

const BACKEND_URL = "http://localhost:8000";

const DESIGN_QUESTIONS = [
  "Design Bit.ly",
  "Design Dropbox",
  "Design a Local Delivery Service",
  "Design Ticketmaster",
  "Design FB News Feed",
  "Design Tinder",
  "Design LeetCode",
  "Design WhatsApp",
  "Design a Rate Limiter",
  "Design FB Live Comments",
  "Design FB Post Search",
  "Design YouTube Top K",
  "Design Uber",
  "Design YouTube",
  "Design a Web Crawler",
  "Design an Ad Click Aggregator",
];

export default function SimulatorPage() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(DESIGN_QUESTIONS[0]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<{
    latency: number;
    cpu: number;
  } | null>(null);
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { messages, sendMessage, status } = useChat();
  const isLoading = status === "streaming" || status === "submitted";

  // Extract last topology from chat messages
  const getLastTopology = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (
          part.type === "dynamic-tool" &&
          part.toolName === "deploy_to_simulator" &&
          (part.state === "output-available" || part.state === "input-available")
        ) {
          return part.input as { nodes: unknown[]; edges: unknown[] };
        }
      }
    }
    return null;
  }, [messages]);

  // Connect WebSocket for telemetry
  useEffect(() => {
    if (!isSimulating || !sessionId) return;

    const ws = new WebSocket(
      `ws://localhost:8000/ws/telemetry/${sessionId}`
    );
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLiveMetrics({ latency: data.latency, cpu: data.cpu });
    };

    ws.onerror = () => {
      setLiveMetrics(null);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [isSimulating, sessionId]);

  const handleRunChaos = async () => {
    if (isSimulating) {
      // Stop simulation
      if (sessionId) {
        try {
          await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`, {
            method: "DELETE",
          });
        } catch {
          // Backend might not be running
        }
      }
      wsRef.current?.close();
      setIsSimulating(false);
      setSessionId(null);
      setLiveMetrics(null);
      return;
    }

    // Start simulation — find the last extracted topology, or use a test topology
    const topology = getLastTopology() ?? {
      session_id: `test-${Date.now().toString(36)}`,
      load_profile: {
        entry_point_node_id: "gateway-1",
        target_qps: 50000,
        read_write_ratio: "80/20",
        traffic_pattern: "steady",
      },
      nodes: [
        {
          id: "gateway-1",
          category: "gateway",
          technology: "go_worker",
          compute_config: {
            concurrency_model: "async_event_loop",
            max_concurrent_requests: 5000,
            timeout_ms: 2000,
          },
        },
        {
          id: "api-1",
          category: "compute",
          technology: "go_worker",
          compute_config: {
            concurrency_model: "thread_pool",
            max_concurrent_requests: 200,
            timeout_ms: 3000,
            cache: { enabled: true, eviction_policy: "lru" },
          },
        },
        {
          id: "user-db",
          category: "database",
          technology: "postgres",
          data_config: { persistence: "disk", replication_factor: 1 },
        },
        {
          id: "session-cache",
          category: "database",
          technology: "redis",
          data_config: { persistence: "in_memory", replication_factor: 1 },
        },
      ],
      edges: [
        { source: "gateway-1", target: "api-1", protocol: "http", is_synchronous: true },
        { source: "api-1", target: "user-db", protocol: "tcp", is_synchronous: true },
        { source: "api-1", target: "session-cache", protocol: "tcp", is_synchronous: true },
      ],
    };

    try {
      const resp = await fetch(`${BACKEND_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topology),
      });

      if (!resp.ok) {
        const err = await resp.text();
        alert(`Failed to start simulation: ${err}`);
        return;
      }

      const info = await resp.json();
      setSessionId(info.session_id);
      setIsSimulating(true);
    } catch {
      alert(
        "Could not connect to backend. Make sure the FastAPI server is running on port 8000."
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && !excalidrawAPI.current) return;

    setInput("");

    const api = excalidrawAPI.current;
    const elements = api?.getSceneElements() ?? [];
    let files: Array<{ type: "file"; mediaType: string; url: string }> = [];

    if (api && elements.length > 0) {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements,
        appState: api.getAppState(),
        files: api.getFiles(),
        mimeType: "image/png",
      });
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );
      files = [
        {
          type: "file",
          mediaType: "image/png",
          url: `data:image/png;base64,${base64}`,
        },
      ];
    }

    await sendMessage({
      text: text || "Please review my architecture diagram.",
      files,
    });

    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="grid h-screen w-screen grid-cols-12 grid-rows-6 bg-gray-950 text-white overflow-hidden">
      {/* Top Header */}
      <header className="col-span-12 row-span-1 flex items-center justify-between border-b border-gray-800 px-6">
        <div className="flex items-center gap-4">
          <select
            value={selectedQuestion}
            onChange={(e) => setSelectedQuestion(e.target.value)}
            className="rounded bg-gray-800 px-3 py-2 text-lg font-bold text-white outline-none focus:ring-1 focus:ring-blue-500"
          >
            {DESIGN_QUESTIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleRunChaos}
          className={`rounded px-4 py-2 font-semibold transition-colors ${
            isSimulating
              ? "bg-red-600 hover:bg-red-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isSimulating ? "Stop Simulation" : "Deploy & Run Test"}
        </button>
      </header>

      {/* Main Canvas */}
      <main className="col-span-8 row-span-4 bg-white min-h-[600px]">
        <Canvas onApiReady={(api) => (excalidrawAPI.current = api)} />
      </main>

      {/* AI Tutor Chat */}
      <aside className="col-span-4 row-span-4 flex flex-col border-l border-gray-800 bg-gray-900">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded bg-blue-900/30 p-3 border border-blue-800 text-sm">
            <p className="font-semibold text-blue-400 mb-1">AI System Tutor</p>
            <p>
              Welcome! Draw your high-level architecture on the left. When you
              are ready, ask me to review it.
            </p>
          </div>

          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="rounded bg-gray-800 p-3 text-sm">
                  {msg.parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => (
                      <p key={i}>{p.text}</p>
                    ))}
                </div>
              ) : (
                <div className="rounded bg-blue-900/30 p-3 border border-blue-800 text-sm">
                  <p className="font-semibold text-blue-400 mb-1">
                    AI System Tutor
                  </p>
                  {msg.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <p key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    if (
                      part.type === "dynamic-tool" &&
                      part.toolName === "deploy_to_simulator" &&
                      part.state === "output-available"
                    ) {
                      return (
                        <div
                          key={i}
                          className="mt-2 rounded bg-green-900/30 border border-green-700 p-2 text-xs"
                        >
                          <p className="font-semibold text-green-400 mb-1">
                            Topology Extracted
                          </p>
                          <pre className="overflow-x-auto">
                            {JSON.stringify(part.input, null, 2)}
                          </pre>
                        </div>
                      );
                    }
                    if (
                      part.type === "dynamic-tool" &&
                      part.toolName === "deploy_to_simulator" &&
                      (part.state === "input-streaming" ||
                        part.state === "input-available")
                    ) {
                      return (
                        <div
                          key={i}
                          className="mt-2 text-xs text-gray-400 animate-pulse"
                        >
                          Extracting topology...
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="text-sm text-gray-400 animate-pulse">
              Thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-800 p-4"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for a review..."
            disabled={isLoading}
            className="w-full rounded bg-gray-800 px-4 py-2 text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
        </form>
      </aside>

      {/* Telemetry Footer */}
      <footer className="col-span-12 row-span-1 border-t border-gray-800 bg-gray-950">
        <Dashboard isSimulating={isSimulating} liveMetrics={liveMetrics} />
      </footer>
    </div>
  );
}
