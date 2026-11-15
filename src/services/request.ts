import { fetchSyncPost, IWebSocketData } from "siyuan";

export type RequestApiOptions = {
  /**
   * Frontend timeout in milliseconds. The returned promise rejects when the
   * kernel does not answer in time (the kernel side keeps its own timeouts).
   */
  timeoutMs?: number;
};

export async function requestApi<T = any>(
  url: string,
  data?: any,
  options?: RequestApiOptions
): Promise<T> {
  const request: Promise<IWebSocketData> = fetchSyncPost(url, data);
  const res: IWebSocketData = options?.timeoutMs ?
      await raceWithTimeout(request, options.timeoutMs, url) :
      await request;
  if (!res || res.code !== 0) {
    const msg = res?.msg || `Request failed: ${url}`;
    throw new Error(msg);
  }
  return res.data as T;
}

function raceWithTimeout(
  request: Promise<IWebSocketData>,
  timeoutMs: number,
  url: string
): Promise<IWebSocketData> {
  return new Promise<IWebSocketData>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`请求超时：${url}（${timeoutMs}ms）`));
    }, Math.max(1, timeoutMs));
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
