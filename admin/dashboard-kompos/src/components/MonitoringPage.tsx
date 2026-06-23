import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import type { SelectedUser } from "./UserPage";
import type { HistoryRow } from "./HistoryPage";

type MonitoringRow = {
  tanggal: string;
  suhu: string | number;
  kelembaban: string | number;
  ph: number | null;
  gas: number | null;
  pengaduk: "Aktif" | "Mati" | null;
  pompa: "Aktif" | "Mati" | null;
  fan: "Aktif" | "Mati" | null;
  status: string | null;
};

type MonitoringResponse = {
  history: HistoryRow | null;
  rows: MonitoringRow[];
};

function Pill({ value }: { value: "Aktif" | "Mati" | null }) {
  if (!value) return <span>-</span>;
  return <span className={`pill ${value === "Aktif" ? "ok" : "no"}`}>{value}</span>;
}

export default function MonitoringPage({
  user,
  history,
  onBack,
}: {
  user: SelectedUser | null;
  history: HistoryRow | null;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<MonitoringRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user || !history) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setRows([]);

        const data = await apiGet<MonitoringResponse>(
          `/api/devices/${user.idAlat}/history/${history.id}/monitoring`
        );

        if (alive) {
          setRows(Array.isArray(data?.rows) ? data.rows : []);
        }
      } catch (e: any) {
        if (alive) setErr(e?.message || "Gagal load monitoring");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user, history]);

  return (
    <div className="monitoringWrap">
      <div className="monitoringCard">
        <div className="monitoringHeader">
          <div className="monitoringHeaderTitle">Monitoring Pengomposan</div>
        </div>

        <div className="monitoringBody">
          {loading && <div style={{ fontWeight: 800 }}>Loading...</div>}
          {err && <div style={{ fontWeight: 800, color: "red" }}>{err}</div>}

          <div className="monitoringTableScroll">
            <table className="monitoringTable">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Suhu</th>
                  <th>Kelembaban</th>
                  <th>PH</th>
                  <th>Gas</th>
                  <th>Pengaduk</th>
                  <th>Pompa</th>
                  <th>Fan</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {!user || !history ? (
                  <tr>
                    <td colSpan={9} className="monitoringEmpty">
                      Tidak ada data dipilih.
                    </td>
                  </tr>
                ) : rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={9} className="monitoringEmpty">
                      Belum ada data monitoring.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.tanggal}</td>
                      <td>{r.suhu}</td>
                      <td>{r.kelembaban}</td>
                      <td>{r.ph ?? "-"}</td>
                      <td>{r.gas ?? "-"}</td>
                      <td><Pill value={r.pengaduk} /></td>
                      <td><Pill value={r.pompa} /></td>
                      <td><Pill value={r.fan} /></td>
                      <td style={{ fontWeight: 900 }}>{r.status ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="monitoringFooter">
            <button className="btnView" onClick={onBack}>Kembali ke History</button>
          </div>
        </div>
      </div>
    </div>
  );
}