"use client";
import { useState, useEffect } from "react";
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type MetricsPoint = { time: string; latency: number; cpu: number };

interface DashboardProps {
  isSimulating: boolean;
  liveMetrics?: { latency: number; cpu: number } | null;
}

export default function Dashboard({ isSimulating, liveMetrics }: DashboardProps) {
  const [data, setData] = useState<MetricsPoint[]>([]);

  // Append live metrics from WebSocket when available
  useEffect(() => {
    if (!isSimulating || !liveMetrics) return;

    setData((prev) => [
      ...prev.slice(-30),
      {
        time: new Date().toLocaleTimeString(),
        latency: liveMetrics.latency,
        cpu: liveMetrics.cpu,
      },
    ]);
  }, [isSimulating, liveMetrics]);

  // Fallback: generate fake data when simulating without a backend connection
  useEffect(() => {
    if (!isSimulating || liveMetrics) return;

    const interval = setInterval(() => {
      setData((prev) => [
        ...prev.slice(-30),
        {
          time: new Date().toLocaleTimeString(),
          latency: Math.floor(Math.random() * 50) + 10,
          cpu: Math.floor(Math.random() * 20) + 5,
        },
      ]);
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating, liveMetrics]);

  // Clear data when simulation stops
  useEffect(() => {
    if (!isSimulating) setData([]);
  }, [isSimulating]);

  return (
    <div className="flex h-full gap-4 p-4 text-white">
      <div className="flex-1 min-w-0 flex flex-col rounded border border-gray-700 bg-gray-900 p-2">
        <h3 className="mb-2 text-xs text-gray-400">API Latency (ms)</h3>
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

      <div className="flex-1 min-w-0 flex flex-col rounded border border-gray-700 bg-gray-900 p-2">
        <h3 className="mb-2 text-xs text-gray-400">Container CPU (%)</h3>
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
