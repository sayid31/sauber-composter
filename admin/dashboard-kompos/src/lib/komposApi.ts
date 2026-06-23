import { apiGet } from "./api";

export type SessionRow = {
  id: number;
  tanggalMulai: string;
  tanggalMatang?: string | null;
  durasi?: string | null;
  status: string;
  userId?: number;
};

export type ReadingRow = {
  id: number;
  sessionId: number;
  createdAt: string;
  suhu?: number;
  kelembapan?: number;
  ph?: number;
  gas?: number;
};

export const getSessions = () => apiGet<SessionRow[]>("/sessions");

// INI yang bikin Monitoring berdiri sendiri:
export const getActiveSession = () => apiGet<SessionRow | null>("/sessions/active");

export const getSessionById = (id: number) => apiGet<SessionRow>(`/sessions/${id}`);

export const getReadings = (sessionId: number, limit = 200) =>
  apiGet<ReadingRow[]>(`/readings?sessionId=${sessionId}&limit=${limit}`);
