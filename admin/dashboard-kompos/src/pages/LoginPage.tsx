import { useState } from "react";
import { User, KeyRound } from "lucide-react";
import "./login.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) throw new Error(`Login gagal: ${res.status}`);
      const data = await res.json(); // { token, user }

      localStorage.setItem("kompos_token", data.token);
      localStorage.setItem("kompos_user", JSON.stringify(data.user));
      onLogin();
    } catch (e: any) {
      setErr(e.message || "Login gagal");
    }
  }

  return (
    <div className="loginScreen">
      <div className="loginCard">
        <h1 className="loginTitle">Login</h1>

        {err ? <div style={{ color: "red", fontWeight: 700 }}>{err}</div> : null}

        <form onSubmit={onSubmit} className="loginForm">
          <div className="loginRow">
            <div className="loginIcon">
              <User size={28} />
            </div>
            <input
              className="loginInput"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="loginRow">
            <div className="loginIcon">
              <KeyRound size={28} />
            </div>
            <input
              className="loginInput"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className="loginBtn" type="submit">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
