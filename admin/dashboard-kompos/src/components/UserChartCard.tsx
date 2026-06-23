import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

type Trap = { type: "trap"; a: number; b: number; c: number; d: number };
type Tri = { type: "tri"; a: number; b: number; c: number };
type MF = Trap | Tri;

type Props = {
  title: string;
  currentValue: number;
  domain: { min: number; max: number };
  mfs: Record<string, MF>;
};

function tri(x: number, a: number, b: number, c: number) {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

function trap(x: number, a: number, b: number, c: number, d: number) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

function mu(x: number, mf: MF) {
  return mf.type === "tri"
    ? tri(x, mf.a, mf.b, mf.c)
    : trap(x, mf.a, mf.b, mf.c, mf.d);
}

function linspace(min: number, max: number, steps: number) {
  const out: number[] = [];
  const step = (max - min) / (steps - 1);
  for (let i = 0; i < steps; i++) out.push(min + step * i);
  return out;
}

export default function UserChartCard({ title, currentValue, domain, mfs }: Props) {
  const labels = Object.keys(mfs || {});

  const data = useMemo(() => {
    const xs = linspace(domain.min, domain.max, 121);
    return xs.map((x) => {
      const row: any = { x: Number(x.toFixed(2)) };
      for (const label of labels) {
        row[label] = Number(mu(x, mfs[label]).toFixed(4));
      }
      return row;
    });
  }, [domain.min, domain.max, labels.join("|")]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        minHeight: 260,
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontWeight: 900,
          fontSize: 20,
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      {/* CHART ONLY (tanpa angka di atas) */}
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" domain={[domain.min, domain.max]} />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Legend />

            {/* garis nilai input */}
            <ReferenceLine x={currentValue} stroke="#111" strokeDasharray="4 4" />

            {labels.map((label, i) => (
              <Line
                key={label}
                type="monotone"
                dataKey={label}
                dot={false}
                strokeWidth={2}
                stroke={["#2563eb", "#16a34a", "#f97316", "#a855f7", "#ef4444"][i % 5]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}