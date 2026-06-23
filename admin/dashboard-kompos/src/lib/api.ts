const BASE_URL = "https://api.composter.my.id"; 

export async function apiGet<T>(endpoint: string): Promise<T> {
  const token = localStorage.getItem("kompos_token"); 
  
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Terjadi kesalahan" }));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(endpoint: string, body: any): Promise<T> {
  const token = localStorage.getItem("kompos_token");

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Terjadi kesalahan" }));
    throw new Error(err.message || `Error ${res.status}`);
  }

  return res.json();
}