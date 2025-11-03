// src/utils/http.ts

export async function httpJson<T>(input: RequestInfo, init?: RequestInit): Promise<{ data: T; status: number }> {
  const res = await fetch(input, init);
  const status = res.status;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(text || `HTTP ${status}`);
    // @ts-expect-error attach status
    err.status = status;
    throw err;
  }
  const data = (await res.json()) as T;
  return { data, status };
}

