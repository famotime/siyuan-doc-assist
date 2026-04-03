import { requestApi } from "@/services/request";

export type ForwardProxyHeader = Record<string, string>;

export type ForwardProxyResponse = {
  status: number;
  body: string;
  elapsed?: number;
};

export async function forwardProxy(
  url: string,
  method = "GET",
  payload: any = {},
  headers: ForwardProxyHeader[] = [],
  timeout = 7000,
  contentType = "text/html"
): Promise<ForwardProxyResponse> {
  return requestApi<ForwardProxyResponse>("/api/network/forwardProxy", {
    url,
    method,
    timeout,
    contentType,
    headers,
    payload,
  });
}
