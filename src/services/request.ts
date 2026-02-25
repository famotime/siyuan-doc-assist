import { fetchSyncPost, IWebSocketData } from "siyuan";

export async function requestApi<T = any>(url: string, data?: any): Promise<T> {
  const res: IWebSocketData = await fetchSyncPost(url, data);
  if (!res || res.code !== 0) {
    const msg = res?.msg || `Request failed: ${url}`;
    throw new Error(msg);
  }
  return res.data as T;
}
