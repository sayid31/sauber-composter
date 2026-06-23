import { useEffect, useState, type CSSProperties } from "react";
import { apiGet } from "../lib/api";
import type { SelectedUser } from "./UserPage";

export type HistoryRow = {
  id: number; // batch id
  tanggalMulai: string;
  tanggalMatang: string;
  durasi: string;
  status: string;
};

// ✅ formatter durasi: "12" -> "12 hari"
function formatDurasi(d: any) {
  if (d === null || d === undefined || d === "") return "-";
  const s = String(d).trim();
  // kalau sudah ada kata hari, biarkan
  if (/\bhari\b/i.test(s)) return s;
  // kalau angka, jadikan "xx hari"
  const n = Number(s);
  if (!Number.isNaN(n)) return `${n} hari`;
  return s;
}

export default function HistoryPage({
  user,
  onBack,
  onOpenMonitoring,
}: {
  user: SelectedUser | null;
  onBack: () => void;
  onOpenMonitoring: (history: HistoryRow) => void;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        const data = await apiGet<HistoryRow[]>(`/api/devices/${user.idAlat}/history`);
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Gagal load history");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.idAlat]);

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
          <div className="historyHeaderTitle">Histori Pengomposan</div>
        </div>

        <div className="historyBody">
          {loading && <div style={{ fontWeight: 800 }}>Loading...</div>}
          {err && <div style={{ fontWeight: 800, color: "red" }}>{err}</div>}

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
                {!user ? (
                  <tr>
                    <td colSpan={5} className="historyEmpty">
                      Tidak ada pengguna dipilih.
                    </td>
                  </tr>
                ) : rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="historyEmpty">
                      Belum ada riwayat untuk alat ini.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.tanggalMulai}</td>
                      <td>{r.tanggalMatang || "-"}</td>

                      {/* ✅ durasi jadi "xx hari" */}
                      <td>{formatDurasi(r.durasi)}</td>

                      <td className="historyStatus" style={{ fontWeight: 800 }}>
                        {r.status}
                      </td>
                      <td>
                        <button className="btnView" onClick={() => onOpenMonitoring(r)}>
                          Lihat
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="historyFooter">
          <button className="btnView" onClick={onBack}>
            Kembali ke Pengguna
          </button>
        </div>
      </div>
    </div>
  );
}