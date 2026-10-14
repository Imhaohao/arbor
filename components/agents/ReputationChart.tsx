"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Point {
  index: number;
  score: number;
}

export function ReputationChart({
  startingScore,
  events,
}: {
  startingScore: number;
  events: Array<{ new_score: number }>;
}) {
  const data: Point[] = [
    { index: 0, score: startingScore },
    ...events.map((e, i) => ({ index: i + 1, score: e.new_score })),
  ];

  if (data.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center rounded-control bg-surface-subtle text-[0.8125rem] text-ink-muted">
        No reputation events yet
      </div>
    );
  }

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -28 }}
        >
          <XAxis dataKey="index" hide />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: "oklch(var(--ink-muted))", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            ticks={[0, 0.5, 1]}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(var(--surface))",
              border: "none",
              borderRadius: 12,
              fontSize: 12,
              boxShadow: "0 8px 24px -8px oklch(var(--ink) / 0.18)",
            }}
            labelStyle={{ color: "oklch(var(--ink-muted))" }}
            itemStyle={{ color: "oklch(var(--brand-600))" }}
            formatter={(v: number) => [v.toFixed(3), "rep"]}
            labelFormatter={(l) => `Event ${l}`}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="oklch(var(--brand-500))"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "oklch(var(--brand-500))", strokeWidth: 0 }}
            isAnimationActive
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
