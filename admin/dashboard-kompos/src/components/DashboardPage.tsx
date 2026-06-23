import StatCard from "./StatCard";
import ChartCard from "./ChartCard";
import ActivityCard from "./ActivityCard";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api"; 
import { Wrench } from "lucide-react";

type Summary = { totalDevices: number; activeDevices: number; totalUsers: number };
type ChartPayload = { labels: string[]; values: number[] };
type ActivityItem = { title: string; detail: string; ts: string };

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mode, setMode] = useState<"harian" | "bulanan" | "tahunan">("harian");
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const s = await apiGet<Summary>("/api/dashboard/summary");
        setSummary(s);
      } catch (e: any) {
        setErr(e.message || "Gagal load summary");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const c = await apiGet<ChartPayload>(`/api/dashboard/kompos-matang?mode=${mode}`);
        setChart(c);
      } catch (e: any) {
        setErr(e.message || "Gagal load chart");
      }
    })();
  }, [mode]);

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const a = await apiGet<ActivityItem[]>("/api/dashboard/activity?limit=5");
        setActivity(a);
      } catch (e: any) {
        setErr(e.message || "Gagal load activity");
      }
    })();
  }, []);

  const chartData = useMemo(() => {
    if (!chart) return [];
    return chart.labels.map((label, i) => ({ label, value: chart.values[i] ?? 0 }));
  }, [chart]);

  return (
    <div>
      {err ? <div style={{ color: "red", fontWeight: 700 }}>{err}</div> : null}

      {/* Stat cards */}
      <div className="statRow">
        <StatCard
          title="Alat"
          value={`${summary?.totalDevices ?? 0} unit`}
          variant="green"
          icon={<Wrench size={56} strokeWidth={3} />}
        />

        <StatCard
          title="Alat aktif"
          value={`${summary?.activeDevices ?? 0} unit`}
          variant="blue"
          showDot
          // sengaja TANPA icon -> hasilnya cuma titik hijau
        />


      </div>

      {/* Tabs */}
      <div className="chartTabs">
        <button className={`chartTab ${mode === "harian" ? "active" : ""}`} onClick={() => setMode("harian")}>
          Harian
        </button>
        <button className={`chartTab ${mode === "bulanan" ? "active" : ""}`} onClick={() => setMode("bulanan")}>
          Bulanan
        </button>
        <button className={`chartTab ${mode === "tahunan" ? "active" : ""}`} onClick={() => setMode("tahunan")}>
          Tahunan
        </button>
      </div>

      {/* Chart + Activity */}
      <div className="dashGrid">
        <ChartCard title="Kompos Matang" data={chartData} />
        <ActivityCard title="Aktivitas Terbaru" items={activity} />
      </div>
    </div>
  );
}
