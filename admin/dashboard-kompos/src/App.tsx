import { useMemo, useState, useEffect } from "react";
import "./App.css";
import LoginPage from "./pages/LoginPage";

// ADMIN UI
import Sidebar, { PageKey } from "./components/Sidebar";
import Topbar from "./components/Topbar";
import DashboardPage from "./components/DashboardPage";
import UserPage from "./components/UserPage";
import HistoryPage from "./components/HistoryPage";
import MonitoringPage from "./components/MonitoringPage";

// USER UI
import UserSidebar from "./components/UserSidebar";
import UserTopbar from "./components/UserTopbar"; // ✅ TAMBAHAN: Import UserTopbar
import UserDashboardPage from "./components/UserDashboardPage";
import UserHistoryPage from "./components/UserHistroyPage.tsx"; 
import UserMonitoringPage from "./components/UserMonitoringPage";

// =====================
// TYPES
// =====================
export type SelectedUser = {
  idAlat: number;
  idTelegram: number;
  nama: string;
  status: "Aktif" | "Tidak Aktif";
};

export type HistoryRow = {
  id: number;
  tanggalMulai: string;
  tanggalMatang: string;
  durasi: string;
  status: string;
};

type AuthUser = {
  id: number;
  username: string;
  role: "admin" | "user";
  device_id?: number | null;
};

type UserPageKey = "dashboard" | "history" | "monitoring";

// Fungsi untuk load data user dari LocalStorage
function loadAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem("kompos_user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const [auth, setAuth] = useState<AuthUser | null>(() => loadAuth());
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem("kompos_token") && !!loadAuth();
  });

  // ✅ TAMBAHAN: State untuk mengontrol Hamburger Menu (Buka/Tutup)
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // ADMIN State
  const [page, setPage] = useState<PageKey>("dashboard");
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<HistoryRow | null>(null);

  // USER State
  const [userPage, setUserPage] = useState<UserPageKey>("dashboard");
  const [userSelectedHistory, setUserSelectedHistory] = useState<HistoryRow | null>(null);

  const role: "admin" | "user" = auth?.role === "user" ? "user" : "admin";
  const username = auth?.username || "Admin";

  // Dynamic Titles
  const adminTitle = useMemo(() => {
    if (page === "dashboard") return "Dashboard";
    if (page === "users") return "Pengguna";
    if (page === "history") return `History - ${selectedUser?.nama || "Pengguna"}`;
    return "Detail Monitoring";
  }, [page, selectedUser]);

  const userTitle = useMemo(() => {
    if (userPage === "dashboard") return "Dashboard";
    if (userPage === "history") return "History";
    return userSelectedHistory ? "Monitoring" : "Monitoring";
  }, [userPage, userSelectedHistory]);

  const handleLogout = () => {
    localStorage.removeItem("kompos_token");
    localStorage.removeItem("kompos_user");
    setIsLoggedIn(false);
    setAuth(null);

    // Reset State Admin
    setPage("dashboard");
    setSelectedUser(null);
    setSelectedHistory(null);

    // Reset State User
    setUserPage("dashboard");
    setUserSelectedHistory(null);
  };

  // Jika belum login, tampilkan halaman Login
  if (!isLoggedIn || !auth) {
    return (
      <LoginPage
        onLogin={() => {
          const a = loadAuth();
          setAuth(a);
          setIsLoggedIn(!!localStorage.getItem("kompos_token") && !!a);
        }}
      />
    );
  }

  // =====================
  // USER LAYOUT
  // =====================
  if (role === "user") {
    const deviceId = Number(auth.device_id || 0);

    return (
      <div className="uShell appLayout">
        <UserSidebar
          active={userPage}
          isOpen={isMenuOpen} // ✅ TAMBAHAN: Kirim status menu
          onClose={() => setIsMenuOpen(false)} // ✅ TAMBAHAN: Fungsi tutup menu
          onSelect={(p: UserPageKey) => {
            setUserPage(p);
            // Jika user klik menu "Monitoring" dari sidebar, bersihkan history 
            // agar yang tampil adalah monitoring "Hari Ini" (Current)
            if (p === "monitoring") {
              setUserSelectedHistory(null);
            }
            setIsMenuOpen(false); // ✅ TAMBAHAN: Otomatis tutup menu saat pindah halaman
          }}
        />

        <div className="uMain mainContent">
          {/* ✅ TAMBAHAN: Gunakan UserTopbar & kirim fungsi buka menu */}
          <UserTopbar 
            title={userTitle} 
            username={username} 
            onLogout={handleLogout} 
            onOpenMenu={() => setIsMenuOpen(true)} 
          />

          <main className="uContent pageContainer">
            {!deviceId ? (
              <div style={{ padding: 16, fontWeight: 800, color: "red" }}>
                Device belum terhubung ke akun ini. Hubungi Admin.
              </div>
            ) : (
              <>
                {userPage === "dashboard" && <UserDashboardPage deviceId={deviceId} />}

                {userPage === "history" && (
                  <UserHistoryPage
                    deviceId={deviceId}
                    onOpenMonitoring={(h: HistoryRow) => {
                      setUserSelectedHistory(h); // Simpan data batch history yang dipilih
                      setUserPage("monitoring"); // Pindah ke halaman monitoring
                    }}
                  />
                )}

                {userPage === "monitoring" && (
                  <UserMonitoringPage
                    deviceId={deviceId}
                    history={userSelectedHistory} // Jika null = tampilkan hari ini
                    onBack={() => setUserPage("history")}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  // =====================
  // ADMIN LAYOUT
  // =====================
  return (
    <div className="appShell appLayout">
      <Sidebar 
        active={page} 
        isOpen={isMenuOpen} // ✅ TAMBAHAN: Kirim status menu
        onClose={() => setIsMenuOpen(false)} // ✅ TAMBAHAN: Fungsi tutup menu
        onSelect={(p) => { 
          setPage(p); 
          setIsMenuOpen(false); // ✅ TAMBAHAN: Otomatis tutup menu saat pindah halaman
        }} 
      />

      <div className="appMain mainContent">
        <Topbar 
          title={adminTitle} 
          role="Admin" 
          username={username} 
          onLogout={handleLogout} 
          onOpenMenu={() => setIsMenuOpen(true)} // ✅ TAMBAHAN: Fungsi buka menu
        />

        <main className="appContent pageContainer">
          {page === "dashboard" && <DashboardPage />}

          {page === "users" && (
            <UserPage
              onOpenHistory={(u) => {
                setSelectedUser(u);
                setSelectedHistory(null); 
                setPage("history");
              }}
            />
          )}

          {page === "history" && (
            <HistoryPage
              user={selectedUser}
              onBack={() => setPage("users")}
              onOpenMonitoring={(h) => {
                setSelectedHistory(h);
                setPage("monitoring");
              }}
            />
          )}

          {page === "monitoring" && (
            <MonitoringPage 
              user={selectedUser} 
              history={selectedHistory} 
              onBack={() => setPage("history")} 
            />
          )}
        </main>
      </div>
    </div>
  );
}