import { useEffect, useState, type CSSProperties } from "react";
import type { HistoryRow } from "../App";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

// ✅ formatter durasi: "12" -> "12 hari"
function formatDurasi(d: any) {
  if (d === null || d === undefined || d === "") return "-";
  const s = String(d).trim();
  if (/\bhari\b/i.test(s)) return s;
  const n = Number(s);
  if (!Number.isNaN(n)) return `${n} hari`;
  return s;
}

export default function UserHistoryPage({
  deviceId,
  onOpenMonitoring,
}: {
  deviceId: number;
  onOpenMonitoring: (row: HistoryRow) => void;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);

        const token = localStorage.getItem("kompos_token");
        const res = await fetch(`${API_BASE}/api/devices/${deviceId}/history`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.message || `GET history failed: ${res.status}`);

        setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setErr(e?.message || "Gagal ambil history");
      } finally {
        setLoading(false);
      }
    })();
  }, [deviceId]);

  const tableScrollStyle: CSSProperties = {
    maxHeight: "420px",
    overflowY: "auto",
    overflowX: "auto",
    borderRadius: 14,
  };

  const thStickyStyle: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "#f3f3f3",
    boxShadow: "0 2px 0 rgba(0,0,0,0.08)",
  };

  return (
    <div className="historyWrap">
      <div className="historyCard">
        <div className="historyHeader">
          <h2 className="historyHeaderTitle">Histori Pengomposan</h2>
        </div>

        <div className="historyBody">
          {loading ? (
            <div className="historyEmpty">Loading...</div>
          ) : err ? (
            <div className="historyEmpty" style={{ color: "crimson" }}>
              {err}
            </div>
          ) : rows.length === 0 ? (
            <div className="historyEmpty">Belum ada data</div>
          ) : (
            <div className="historyTableScroll" style={tableScrollStyle}>
              <table className="historyTable">
                <thead>
                  <tr>
                    <th style={thStickyStyle}>Tanggal Mulai</th>
                    <th style={thStickyStyle}>Tanggal Matang</th>
                    <th style={thStickyStyle}>Durasi</th>
                    <th style={thStickyStyle}>Status</th>
                    <th style={thStickyStyle}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isBerjalan = String(r.status).toLowerCase() === "berjalan";
                    return (
                      <tr key={r.id}>
                        <td>{r.tanggalMulai}</td>
                        <td>{r.tanggalMatang || "-"}</td>

                        {/* ✅ durasi jadi "xx hari" */}
                        <td>{formatDurasi((r as any).durasi)}</td>

                        <td className="historyStatus" style={{ fontWeight: 800 }}>
                          {r.status}
                        </td>
                        <td>
                          <button className="btnView" onClick={() => onOpenMonitoring(r)}>
                            {isBerjalan ? "Pantau" : "Lihat"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="historyFooter" />
        </div>
      </div>
    </div>
  );
}