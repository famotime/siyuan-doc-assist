/**
 * 有界并发 map：保持输入顺序，最多同时运行 `concurrency` 个 worker。
 * 供 AI 批处理等服务限制并发请求数，避免大文档触发 API 限流或内存压力
 * （审计遗留项 2.4）。纯函数，不依赖任何运行时 API。
 *
 * 失败语义与 Promise.all 一致：任一 worker 拒绝则整体拒绝；
 * 其余 lane 中未启动的任务仍会继续消费，但结果不再被等待。
 */
export const DEFAULT_MAP_CONCURRENCY = 4;

export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  concurrency: number,
  worker: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = Array.from<TOut>({ length: items.length }) as TOut[];
  let nextIndex = 0;
  const runners: Array<Promise<void>> = [];
  for (let lane = 0; lane < limit; lane += 1) {
    runners.push((async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await worker(items[index], index);
      }
    })());
  }
  await Promise.all(runners);
  return results;
}
