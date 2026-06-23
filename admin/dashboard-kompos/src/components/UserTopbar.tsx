import { useEffect, useRef, useState } from "react";
import { User, Menu } from "lucide-react";

export default function UserTopbar({
  title,
  username,
  onLogout,
  onOpenMenu,
}: {
  title: string;
  username: string;
  onLogout: () => void;
  onOpenMenu?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <header className="uTopbar">
      <div className="uTopbarLeft">
        {/* ✅ Tombol Hamburger */}
        {onOpenMenu && (
          <button className="hamburgerBtn" onClick={onOpenMenu} type="button">
            <Menu size={28} />
          </button>
        )}
        <h1 className="uTopbarTitle">{title}</h1>
        <div className="uTopbarDivider" />
        <div className="uTopbarRole">User</div>
      </div>

      <div className="uTopbarRight" ref={ref}>
        <button className="uProfileBtn" onClick={() => setOpen((v) => !v)} type="button">
          <User size={34} />
        </button>

        {open && (
          <div className="uProfileMenu">
            <div className="uProfileName">{username}</div>
            <button className="uLogoutBtn" onClick={onLogout} type="button">
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
