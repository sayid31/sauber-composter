import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import UserChartCard from "./UserChartCard";

type MembershipMap = Record<string, number>;

type DashboardResponse = {
  row: {
    tanggal: string;
    suhu: number | null;
    kelembaban: number | null;
    ph: number | null;
    gas: number | null;
    pengaduk: "Aktif" | "Mati" | null;
    pompa: "Aktif" | "Mati" | null;
    fan: "Aktif" | "Mati" | null;
    status: string | null;
    fuzzy_output: number | null;
  } | null;
  memberships: {
    suhu: MembershipMap;
    kelembaban: MembershipMap;
    ph: MembershipMap;
    gas: MembershipMap;
  } | null;
  activeRules: string[];
};

export default function UserDashboardPage({ deviceId }: { deviceId: number }) {
  void deviceId;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        if (alive) {
          setErr("");
        }

        const res = await apiGet<DashboardResponse>("/api/my/dashboard/current");

        if (!alive) return;
        setData(res);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Gagal mengambil data dashboard");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();

    const timer = setInterval(load, 10000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const row = data?.row ?? null;
  const memberships = data?.memberships ?? null;
  const rules = data?.activeRules ?? [];

  return (
    <div className="uDashWrap">
      {loading && <div className="uDashInfo">Loading...</div>}
      {err && <div className="uDashError">{err}</div>}

      {!loading && !err && !row && (
        <div className="uDashInfo">Belum ada data dashboard.</div>
      )}

      {!loading && !err && row && (
        <>
          <div className="uDashGrid">
            <UserChartCard
              title="Derajat Keanggotaan Ph"
              currentValue={Number(row?.ph ?? 7)}
              domain={{ min: 0, max: 14 }}
              mfs={{
                Asam: { type: "trap", a: 0, b: 0, c: 5.5, d: 6.5 },
                Netral: { type: "tri", a: 6.0, b: 7.0, c: 8.0 },
                Basa: { type: "trap", a: 7.5, b: 8.2, c: 14, d: 14 },
              }}
            />

            <UserChartCard
              title="Derajat Keanggotaan Suhu"
              currentValue={Number(row?.suhu ?? 0)}
              domain={{ min: 0, max: 100 }}
              mfs={{
                Rendah: { type: "trap", a: 0, b: 0, c: 25, d: 35 },
                Sedang: { type: "tri", a: 28, b: 35, c: 42 },
                Tinggi: { type: "tri", a: 38, b: 55, c: 75 },
                SangatTinggi: { type: "trap", a: 70, b: 80, c: 100, d: 100 },
              }}
            />

            <UserChartCard
              title="Derajat Keanggotaan Kelembaban"
              currentValue={Number(row?.kelembaban ?? 0)}
              domain={{ min: 0, max: 100 }}
              mfs={{
                Kering: { type: "trap", a: 0, b: 0, c: 40, d: 50 },
                Ideal: { type: "tri", a: 45, b: 55, c: 65 },
                Basah: { type: "trap", a: 60, b: 70, c: 100, d: 100 },
              }}
            />

            <UserChartCard
              title="Derajat Keanggotaan Gas"
              currentValue={Number(row?.gas ?? 0)}
              domain={{ min: 0, max: 100 }}
              mfs={{
                SangatRendah: { type: "trap", a: 0, b: 0, c: 5, d: 15 },
                Rendah: { type: "tri", a: 10, b: 25, c: 40 },
                Sedang: { type: "tri", a: 35, b: 55, c: 70 },
                Tinggi: { type: "trap", a: 65, b: 80, c: 100, d: 100 },
              }}
            />
          </div>

          <div className="uDashBottom">
            <div className="activityCard">
              <div className="activityHeader">Rule Fuzzy Aktif</div>

              <div className="uRuleLines">
                {rules.length === 0 ? (
                  <div className="uRuleLine">Belum ada rule aktif.</div>
                ) : (
                  rules.map((t, i) => (
                    <div key={i} className="uRuleLine">
                      {t}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="uFuzzyResultCard">
              <div className="uFuzzyTitle">Hasil Keputusan Fuzzy</div>

              <div className="uFuzzyRow">
                <div className="uFuzzyLabel">Nilai Output:</div>
                <div className="uFuzzyValue">
                  {Number(row.fuzzy_output || 0).toFixed(0)}%
                </div>
              </div>

              <div className="uFuzzyRow">
                <div className="uFuzzyLabel">Status:</div>
                <div className="uFuzzyValue">{row.status || "-"}</div>
              </div>

              <div className="uFuzzyActions">
                <div className="uFuzzyAction">
                  <div className="uFuzzyActionLabel">Pengaduk</div>
                  <span className={`uPill ${row.pengaduk === "Aktif" ? "on" : "off"}`}>
                    {row.pengaduk === "Aktif" ? "ON" : "OFF"}
                  </span>
                </div>

                <div className="uFuzzyAction">
                  <div className="uFuzzyActionLabel">Pompa</div>
                  <span className={`uPill ${row.pompa === "Aktif" ? "on" : "off"}`}>
                    {row.pompa === "Aktif" ? "ON" : "OFF"}
                  </span>
                </div>

                <div className="uFuzzyAction">
                  <div className="uFuzzyActionLabel">Fan</div>
                  <span className={`uPill ${row.fan === "Aktif" ? "on" : "off"}`}>
                    {row.fan === "Aktif" ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}