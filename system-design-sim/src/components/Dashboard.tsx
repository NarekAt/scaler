"use client";
import { useState, useEffect } from "react";
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard({ isSimulating }: { isSimulating: boolean }) {
  const [data, setData] = useState<{ time: string; latency: number; cpu: number }[]>([]);

  // Simulate live data incoming every second if "Simulating" is active
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setData((prev) => {
        const newData = [...prev.slice(-30), {
          time: new Date().toLocaleTimeString(),
          latency: Math.floor(Math.random() * 50) + 10, // Normal 10-60ms latency
          cpu: Math.floor(Math.random() * 20) + 5,      // Normal 5-25% CPU
        }];
        return newData;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  return (
    <div className="flex h-full gap-4 p-4 text-white">
      {/* Latency Panel */}
      {/* ADDED min-w-0 and flex flex-col to force rigid boundaries */}
      <div className="flex-1 min-w-0 flex flex-col rounded border border-gray-700 bg-gray-900 p-2">
        <h3 className="mb-2 text-xs text-gray-400">API Latency (ms)</h3>
        {/* ADDED flex-1 and min-h-[100px] to guarantee the chart has physical space to render */}
        <div className="flex-1 min-h-[100px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis hide domain={[0, 200]} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} />
              <Line type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CPU Panel */}
      <div className="flex-1 min-w-0 flex flex-col rounded border border-gray-700 bg-gray-900 p-2">
        <h3 className="mb-2 text-xs text-gray-400">Cassandra CPU (%)</h3>
        <div className="flex-1 min-h-[100px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis hide domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} />
              <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
