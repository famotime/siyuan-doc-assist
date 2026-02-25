import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { mapBlockIdsToRootDocIds } from "@/services/kernel";
import { requestApi } from "@/services/request";

describe("kernel mapBlockIdsToRootDocIds", () => {
  const requestApiMock = vi.mocked(requestApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("falls back to row id when root_id is empty for document rows", async () => {
    requestApiMock.mockResolvedValue([
      { id: "20260220075025-ue88wkc", root_id: "" },
      { id: "20260220220208-esrmvws", root_id: "" },
      { id: "20260221114249-31dbi9g", root_id: "20260221114249-31dbi9g" },
    ]);

    const ids = await mapBlockIdsToRootDocIds([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);

    expect(ids).toEqual([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);
  });
});
