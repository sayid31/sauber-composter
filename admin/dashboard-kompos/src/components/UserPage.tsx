import { useEffect, useState, type CSSProperties } from "react";
import { apiGet } from "../lib/api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export type SelectedUser = {
  idAlat: number;
  idTelegram: number;
  nama: string;
  status: "Aktif" | "Tidak Aktif";
};

async function apiDelete(path: string) {
  const token = localStorage.getItem("kompos_token");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `DELETE failed: ${res.status}`);
  return data;
}

// ===== Pill status SOLID (hijau/merah seperti aktuator) =====
function StatusPill({ status }: { status: SelectedUser["status"] }) {
  const aktif = String(status).toLowerCase().includes("aktif") && status === "Aktif";

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 115,
    padding: "8px 18px",
    borderRadius: 999,
    fontWeight: 900,
    color: "#fff",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
    background: aktif ? "#22c55e" : "#ef4444",
  };

  return <span style={style}>{status}</span>;
}

export default function UserPage({
  onOpenHistory,
}: {
  onOpenHistory: (u: SelectedUser) => void;
}) {
  const [rows, setRows] = useState<SelectedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [deletingKey, setDeletingKey] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const data = await apiGet<SelectedUser[]>("/api/users");
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Gagal load users");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ✅ scroll wrapper
  const tableScrollStyle: CSSProperties = {
    maxHeight: "420px",
    overflowY: "auto",
    overflowX: "auto",
    borderRadius: 14,
  };

  // ✅ sticky header
  const thStickyStyle: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "#f3f3f3", // kalau header tabelmu putih, ganti "#fff"
    boxShadow: "0 2px 0 rgba(0,0,0,0.08)",
  };

  const btnDeleteStyle: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.15)",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  };

  async function handleDelete(r: SelectedUser) {
    const key = `${r.idAlat}-${r.idTelegram}`;
    const ok = confirm(
      `Hapus user ini?\n\nNama: ${r.nama}\nTelegram ID: ${r.idTelegram}\nDevice: ${r.idAlat}\n\nUser akan hilang dari daftar.`
    );
    if (!ok) return;

    try {
      setDeletingKey(key);
      setErr("");
      await apiDelete(`/api/users/${r.idAlat}/${r.idTelegram}`);
      setRows((prev) => prev.filter((x) => `${x.idAlat}-${x.idTelegram}` !== key));
    } catch (e: any) {
      setErr(e?.message || "Gagal hapus user");
    } finally {
      setDeletingKey("");
    }
  }

  return (
    <div className="userWrap">
      <div className="userCard">
        <div className="userCardTop">
          <div className="userTitle">Daftar Pengguna</div>
        </div>

        <div className="userBody">
          {loading && <div style={{ fontWeight: 800 }}>Loading...</div>}
          {err && <div style={{ fontWeight: 800, color: "red" }}>{err}</div>}

          {!loading && !err && (
            <div className="tableWrap">
              <div className="userTableScroll" style={tableScrollStyle}>
                <table className="userTable">
                  <thead>
                    <tr>
                      <th style={thStickyStyle}>ID Alat</th>
                      <th style={thStickyStyle}>ID Telegram</th>
                      <th style={thStickyStyle}>Nama</th>
                      <th style={thStickyStyle}>Status</th>
                      <th style={thStickyStyle}>Riwayat</th>
                      <th style={thStickyStyle}>Hapus</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="userEmpty">
                          Belum ada pengguna (coba /start lalu /pair di Telegram).
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => {
                        const key = `${r.idAlat}-${r.idTelegram}`;
                        const isDeleting = deletingKey === key;

                        return (
                          <tr key={key}>
                            <td>{r.idAlat}</td>
                            <td>{r.idTelegram}</td>
                            <td>{r.nama}</td>

                            {/* ✅ Status jadi pill solid hijau/merah */}
                            <td>
                              <StatusPill status={r.status} />
                            </td>

                            <td>
                              <button className="btnView" onClick={() => onOpenHistory(r)}>
                                Riwayat
                              </button>
                            </td>

                            <td>
                              <button
                                className="btnView"
                                style={{ ...btnDeleteStyle, color: "crimson" }}
                                onClick={() => handleDelete(r)}
                                disabled={isDeleting}
                                title="Hapus user dari daftar"
                              >
                                {isDeleting ? "Menghapus..." : "Hapus"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}