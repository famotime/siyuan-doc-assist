import { describe, expect, test } from "vitest";

import {
  extractIrrelevantParagraphMarks,
  SlopMarkerParseDiagnostics
} from "@/services/ai-slop-marker-parser";
import { IrrelevantParagraphCandidate } from "@/services/ai-slop-marker-prompts";

describe("slop marker parse diagnostics (audit low-risk)", () => {
  const paragraphs: IrrelevantParagraphCandidate[] = [
    { id: "p1", markdown: "hello world 保留内容" }
  ];

  test("counts segments whose verbatim text no longer matches the paragraph", () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              paragraphs: [
                { paragraphId: "p1", segments: ["hello world", "AI 改写过的文本", "hello world"] }
              ]
            })
          }
        }
      ]
    };
    const diagnostics: SlopMarkerParseDiagnostics = {
      unknownParagraphIds: [],
      droppedSegments: []
    };

    const marks = extractIrrelevantParagraphMarks(payload, paragraphs, [], diagnostics);

    expect(marks).toEqual([{ paragraphId: "p1", segments: ["hello world"] }]);
    expect(diagnostics.droppedSegments).toEqual([
      { paragraphId: "p1", segment: "AI 改写过的文本" }
    ]);
    expect(diagnostics.unknownParagraphIds).toEqual([]);
  });

  test("counts entries referencing unknown paragraph ids", () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              paragraphs: [
                { paragraphId: "p-unknown", segments: ["hello world"] },
                { paragraphId: "p1", segments: ["hello world"] }
              ]
            })
          }
        }
      ]
    };
    const diagnostics: SlopMarkerParseDiagnostics = {
      unknownParagraphIds: [],
      droppedSegments: []
    };

    const marks = extractIrrelevantParagraphMarks(payload, paragraphs, [], diagnostics);

    expect(marks).toEqual([{ paragraphId: "p1", segments: ["hello world"] }]);
    expect(diagnostics.unknownParagraphIds).toEqual(["p-unknown"]);
  });

  test("clean parse leaves diagnostics empty", () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              paragraphs: [{ paragraphId: "p1", segments: ["hello world"] }]
            })
          }
        }
      ]
    };
    const diagnostics: SlopMarkerParseDiagnostics = {
      unknownParagraphIds: [],
      droppedSegments: []
    };

    const marks = extractIrrelevantParagraphMarks(payload, paragraphs, [], diagnostics);

    expect(marks).toEqual([{ paragraphId: "p1", segments: ["hello world"] }]);
    expect(diagnostics.unknownParagraphIds).toEqual([]);
    expect(diagnostics.droppedSegments).toEqual([]);
  });
});
