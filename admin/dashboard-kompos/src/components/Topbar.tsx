import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

type Props = {
  title: string;
  role: string;
  username: string;
  onLogout: () => void;
  onOpenMenu?: () => void;
};

function IconProfile() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#2f2f2f" opacity="0.15" />
      <path
        d="M12 12c2.4 0 4.3-1.95 4.3-4.35S14.4 3.3 12 3.3 7.7 5.25 7.7 7.65 9.6 12 12 12Z"
        fill="#3b3b3b"
      />
      <path
        d="M5.4 20.3c1.5-3.5 4.2-5.1 6.6-5.1s5.1 1.6 6.6 5.1"
        stroke="#3b3b3b"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Topbar({ title, role, username, onLogout, onOpenMenu }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbarLeft">
        {/* ✅ 3. TAMBAHKAN TOMBOL HAMBURGER INI */}
        {onOpenMenu && (
          <button className="hamburgerBtn" onClick={onOpenMenu} type="button">
            <Menu size={28} />
          </button>
        )}
        <h1 className="topbarTitle">{title}</h1>
        <div className="topbarDivider" />
        <div className="topbarRole">{role}</div>
      </div>

      <div className="topbarRight" ref={wrapRef}>
        <button
          className="profileBtn"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Profil"
        >
          <IconProfile />
        </button>

        {open && (
          <div className="profileMenu" role="menu">
            <div className="profileName" role="menuitem">
              {username}
            </div>
            <button
              className="logoutBtn"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
