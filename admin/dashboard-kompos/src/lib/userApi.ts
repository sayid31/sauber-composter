import { apiGet } from "./api";

export type HistoryRow = {
  id: number;
  tanggalMulai: string;
  tanggalMatang: string;
  durasi: string;
  status: string;
};

export type MonitoringRow = {
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

export function getUserHistory(deviceId: number) {
  return apiGet<HistoryRow[]>(`/api/devices/${deviceId}/history`);
}

export function getActiveBatch(deviceId: number) {
  return apiGet<HistoryRow | null>(`/api/devices/${deviceId}/history/active`);
}

export function getMonitoringByBatch(deviceId: number, batchId: number) {
  return apiGet<MonitoringRow[]>(
    `/api/devices/${deviceId}/history/${batchId}/monitoring`
  );
}
