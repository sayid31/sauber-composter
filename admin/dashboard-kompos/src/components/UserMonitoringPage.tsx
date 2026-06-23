import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { HistoryRow } from "../App";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

type MonRow = {
  tanggal: string;
  suhu: number | null;
  kelembaban: number | null;
  ph: number | null;
  gas: number | null;
  pengaduk: string | null;
  pompa: string | null;
  fan: string | null;
  status: string | null;
};

type BatchInfo = {
  id: number;
  status: string;
  tanggalMulai: string; // dd/mm/yyyy
  tanggalMatang: string; // bisa kosong
  durasi: any; // number/string
};

function isAktif(v: string | number | null | undefined) {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "aktif" || s === "on" || s === "1" || s === "true";
}

function StatusPill({ value }: { value: string | number | null | undefined }) {
  const on = isAktif(value);

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 78,
    padding: "8px 18px",
    borderRadius: 999,
    fontWeight: 800,
    color: "#fff",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
    background: on ? "#22c55e" : "#ef4444",
  };

  return <span style={style}>{on ? "Aktif" : "Mati"}</span>;
}

function formatDurasi(d: any) {
  if (d === null || d === undefined || d === "") return "-";
  const s = String(d).trim();
  if (/\bhari\b/i.test(s)) return s;
  const n = Number(s);
  if (!Number.isNaN(n)) return `${n} hari`;
  return s;
}

function parseDMY(dmy: string) {
  const s = String(dmy || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const dt = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export default function UserMonitoringPage({
  deviceId,
  history,
  onBack,
}: {
  deviceId: number;
  history: HistoryRow | null; // null = realtime
  onBack: () => void;
}) {
  const [rows, setRows] = useState<MonRow[]>([]);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // kalau user klik dari history yang statusnya "Berjalan" => tetap realtime
  const isBerjalanFromHistory = !!history && String(history.status).toLowerCase() === "berjalan";
  const isRealtime = !history || isBerjalanFromHistory;

  // ✅ Judul sesuai request kamu
  const title = isRealtime ? "Monitoring Berjalan" : "Hasil Monitoring";

  // update durasi berjalan (realtime) tiap 1 menit
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isRealtime) return;
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [isRealtime]);

  const durasiBerjalanHari = useMemo(() => {
    if (!isRealtime || !batch?.tanggalMulai) return null;
    const start = parseDMY(batch.tanggalMulai);
    if (!start) return null;

    const now = new Date();
    const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const dayMs = 24 * 60 * 60 * 1000;

    const diff = Math.floor((nowMid.getTime() - startMid.getTime()) / dayMs) + 1; // inclusive
    return Math.max(1, diff);
  }, [isRealtime, batch?.tanggalMulai, tick]);

  const titleStyle: CSSProperties = {
    textAlign: "center",
    fontSize: 42,
    fontWeight: 900,
    margin: "8px 0 6px",
  };

  const subInfoStyle: CSSProperties = {
    textAlign: "center",
    fontWeight: 800,
    opacity: 0.75,
    marginBottom: 14,
  };

  // ✅ scroll container + tinggi tetap (biar tombol gak naik ke atas saat data kosong)
  const tableScrollStyle: CSSProperties = {
    maxHeight: "420px",
    minHeight: "420px", // <-- kunci: selalu ada ruang tabel
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

  // ✅ tombol kembali di bawah, rapi, center
  const backWrapStyle: CSSProperties = {
    marginTop: 18,
    display: "flex",
    justifyContent: "center",
  };

  const backBtnStyle: CSSProperties = {
    padding: "12px 18px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.15)",
    background: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,.10)",
    minWidth: 260,
  };

  async function load() {
    const token = localStorage.getItem("kompos_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    if (isRealtime) {
      const res = await fetch(`${API_BASE}/api/devices/${deviceId}/monitoring/current`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `GET current monitoring failed: ${res.status}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setBatch(data?.batch ? (data.batch as BatchInfo) : null);
    } else {
      // Panggil API History
      const res = await fetch(`${API_BASE}/api/devices/${deviceId}/history/${history!.id}/monitoring`, { headers });
      
      // --- PERBAIKANNYA ADA DI 2 BARIS INI ---
      const data = await res.json().catch(() => ({})); // Tangkap sebagai Object {} bukan Array []
      if (!res.ok) throw new Error(data?.message || `GET monitoring failed: ${res.status}`);
      
      // Ambil data dari dalam 'data.rows', bukan langsung 'data'
      setRows(Array.isArray(data?.rows) ? data.rows : []); 
      // --------------------------------------
      
      setBatch(null);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErr(null);
        setLoading(true);
        await load();
      } catch (e: any) {
        if (alive) setErr(e?.message || "Gagal ambil monitoring");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // realtime auto refresh tiap 5 detik
    let interval: any = null;
    if (isRealtime) {
      interval = setInterval(async () => {
        try {
          await load();
        } catch {
          // diamkan
        }
      }, 5000);
    }

    return () => {
      alive = false;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, history?.id, history?.status, isRealtime]);

  return (
    <div className="monWrap">
      <div className="monCard">
        <h2 className="monTitle" style={titleStyle}>
          {title}
        </h2>

        

        {loading ? (
          <div className="monEmpty" style={{ textAlign: "center", fontWeight: 800 }}>
            Loading...
          </div>
        ) : err ? (
          <div className="monEmpty" style={{ color: "crimson", textAlign: "center", fontWeight: 800 }}>
            {err}
          </div>
        ) : (
          <div className="monTableScroll" style={tableScrollStyle}>
            <table className="monTable">
              <thead>
                <tr>
                  <th style={thStickyStyle}>Tanggal</th>
                  <th style={thStickyStyle}>Suhu</th>
                  <th style={thStickyStyle}>Kelembaban</th>
                  <th style={thStickyStyle}>pH</th>
                  <th style={thStickyStyle}>Gas</th>
                  <th style={thStickyStyle}>Pengaduk</th>
                  <th style={thStickyStyle}>Pompa</th>
                  <th style={thStickyStyle}>Fan</th>
                  <th style={thStickyStyle}>Status</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", fontWeight: 800, padding: "18px 0" }}>
                      Belum ada data monitoring
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.tanggal}</td>
                      <td>{r.suhu ?? "-"}</td>
                      <td>{r.kelembaban ?? "-"}</td>
                      <td>{r.ph ?? "-"}</td>
                      <td>{r.gas ?? "-"}</td>
                      <td>{r.pengaduk ? <StatusPill value={r.pengaduk} /> : "-"}</td>
                      <td>{r.pompa ? <StatusPill value={r.pompa} /> : "-"}</td>
                      <td>{r.fan ? <StatusPill value={r.fan} /> : "-"}</td>
                      <td style={{ fontWeight: 800 }}>{r.status ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ✅ tombol kembali hanya untuk hasil monitoring (batch selesai) dan POSISI DI BAWAH */}
        {!isRealtime && history && (
          <div style={backWrapStyle}>
            <button className="btnBack" style={backBtnStyle} onClick={onBack}>
              ← Kembali ke History
            </button>
          </div>
        )}
      </div>
    </div>
  );
}