import { LayoutDashboard, Users, X } from "lucide-react"; // ✅ TAMBAHKAN IMPORT X

export type PageKey = "dashboard" | "users" | "history" | "monitoring";

export default function Sidebar({
  active,
  isOpen,   // ✅ 1. TAMBAHKAN INI
  onClose,  // ✅ 2. TAMBAHKAN INI
  onSelect,
}: {
  active: PageKey;
  isOpen?: boolean;     // ✅ 3. TAMBAHKAN INI
  onClose?: () => void; // ✅ 4. TAMBAHKAN INI
  onSelect: (p: PageKey) => void;
}) {
  return (
    <>
      {/* ✅ 5. TAMBAHKAN BACKDROP LAYAR GELAP INI */}
      <div 
        className={`sidebarBackdrop ${isOpen ? "open" : ""}`} 
        onClick={onClose}
      />

      {/* ✅ 6. TAMBAHKAN CLASS OPEN DI ASIDE */}
      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebarBrand" style={{ position: "relative" }}>
          
          {/* ✅ 7. TAMBAHKAN TOMBOL CLOSE (X) */}
          {onClose && (
            <button className="hamburgerBtn closeBtn" onClick={onClose} type="button">
              <X size={28} />
            </button>
          )}

          <div className="brandText">
            Sistem <br />
            Monitoring <br />
            Pengomposan
          </div>
        </div>

        <div className="sidebarDivider" />

        <nav className="sidebarNav">
          <button
            className={`navItem ${active === "dashboard" ? "active" : ""}`}
            onClick={() => { onSelect("dashboard"); onClose && onClose(); }} // ✅ Tambah onClose() agar menu nutup saat diklik
            type="button"
          >
            <span className="navIcon">
              <LayoutDashboard size={20} />
            </span>
            <span className="navLabel">Dashboard</span>
          </button>

          <button
            className={`navItem ${active === "users" ? "active" : ""}`}
            onClick={() => { onSelect("users"); onClose && onClose(); }} // ✅ Tambah onClose() juga di sini
            type="button"
          >
            <span className="navIcon">
              <Users size={20} />
            </span>
            <span className="navLabel">Pengguna</span>
          </button>
        </nav>
      </aside>
    </>
  );
}