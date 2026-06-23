import { LayoutDashboard, History, Activity, X } from "lucide-react"; // ✅ Tambah X

export type UserPageKey = "dashboard" | "history" | "monitoring";

export default function UserSidebar({
  active,
  isOpen, 
  onClose, 
  onSelect,
}: {
  active: UserPageKey;
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (p: UserPageKey) => void;
}) {
  return (
    <>
      {/* ✅ Layar Gelap (Backdrop) */}
      <div 
        className={`sidebarBackdrop ${isOpen ? "open" : ""}`} 
        onClick={onClose}
      />

      {/* ✅ Tambahkan class 'open' */}
      <aside className={`uSidebar ${isOpen ? "open" : ""}`}>
        <div className="uSidebarBrand" style={{ position: "relative" }}>
          
          {/* ✅ Tombol Silang (X) */}
          {onClose && (
            <button className="hamburgerBtn closeBtn" onClick={onClose}>
              <X size={28} />
            </button>
          )}

          <div className="uBrandLine">Sistem</div>
          <div className="uBrandLine">Monitoring</div>
          <div className="uBrandLine">Pengomposan</div>
        </div>

        <div className="uSidebarDivider" />

        <nav className="uNav">
          <button
            className={`uNavItem ${active === "dashboard" ? "isActive" : ""}`}
            onClick={() => { onSelect("dashboard"); onClose && onClose(); }} // ✅ Otomatis tutup saat diklik
            type="button"
          >
            <LayoutDashboard className="uNavIcon" />
            <span>Dashboard</span>
          </button>

          <button
            className={`uNavItem ${active === "history" ? "isActive" : ""}`}
            onClick={() => { onSelect("history"); onClose && onClose(); }}
            type="button"
          >
            <History className="uNavIcon" />
            <span>History</span>
          </button>

          <button
            className={`uNavItem ${active === "monitoring" ? "isActive" : ""}`}
            onClick={() => { onSelect("monitoring"); onClose && onClose(); }}
            type="button"
          >
            <Activity className="uNavIcon" />
            <span>Monitoring</span>
          </button>
        </nav>
      </aside>
    </>
  );
}