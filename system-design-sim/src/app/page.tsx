"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Dashboard from "@/components/Dashboard";

// Force Next.js to never SSR the canvas wrapper
const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

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

  const handleRunChaos = () => {
    // In the future, this triggers the FastAPI backend
    setIsSimulating(!isSimulating);
    console.log(isSimulating ? "Stopping simulation..." : "Starting Docker orchestration...");
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    alert("This will eventually capture the Excalidraw PNG and send it to Claude Vision!");
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
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={handleRunChaos}
          className={`rounded px-4 py-2 font-semibold transition-colors ${
            isSimulating ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isSimulating ? "Stop Simulation" : "Deploy & Run Test"}
        </button>
      </header>

      {/* Main Canvas (Left 70%) */}
      <main className="col-span-8 row-span-4 bg-white min-h-[600px]">
        <Canvas />
      </main>

      {/* AI Tutor Chat (Right 30%) */}
      <aside className="col-span-4 row-span-4 flex flex-col border-l border-gray-800 bg-gray-900">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 rounded bg-blue-900/30 p-3 border border-blue-800 text-sm">
            <p className="font-semibold text-blue-400 mb-1">AI System Tutor</p>
            <p>Welcome! Draw your high-level architecture on the left. When you are ready, ask me to review it, and I'll verify if we can simulate it locally.</p>
          </div>
        </div>
        
        {/* Fake Chat Input */}
        <form onSubmit={handleSendMessage} className="border-t border-gray-800 p-4">
          <input 
            type="text" 
            placeholder="Ask for a review..." 
            className="w-full rounded bg-gray-800 px-4 py-2 text-white outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>
      </aside>

      {/* Telemetry Footer */}
      <footer className="col-span-12 row-span-1 border-t border-gray-800 bg-gray-950">
        <Dashboard isSimulating={isSimulating} />
      </footer>
      
    </div>
  );
}
