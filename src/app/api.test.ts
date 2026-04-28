import { afterEach, describe, expect, it, vi } from "vitest";
import { submitTurnStream } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitTurnStream", () => {
  it("parses staged events correctly from chunked SSE frames", async () => {
    const encoder = new TextEncoder();
    const receivedTypes: string[] = [];
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
      }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream"
          }
        })
      )
    );

    const streaming = submitTurnStream("session-1", "我尝试调查高塔入口", "free", (event) => {
      receivedTypes.push(event.type);
    });

    controllerRef?.enqueue(
      encoder.encode(
        [
          "event: turn_started",
          'data: {"type":"turn_started","userMessage":{"id":"message-user-1","sessionId":"session-1","role":"user","inputKind":"free","inferredIntent":"character_action","content":"我尝试调查高塔入口","createdAt":"2026-04-27T00:00:01.000Z"}}',
          "",
          ""
        ].join("\n")
      )
    );

    controllerRef?.enqueue(
      encoder.encode(
        [
          "event: narration_chunk",
          'data: {"type":"narration_chunk","assistantMessageId":"message-gm-1","chunk":"你开始行动。"}',
          "",
          ""
        ].join("\n")
      )
    );
    controllerRef?.close();
    await streaming;
    expect(receivedTypes).toEqual(["turn_started", "narration_chunk"]);
  });

  it("throws when server emits turn_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          [
            "event: turn_error",
            'data: {"type":"turn_error","message":"upstream failed"}',
            ""
          ].join("\n"),
          {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream"
            }
          }
        )
      )
    );

    await expect(
      submitTurnStream("session-1", "继续", "continue", () => {
        // noop
      })
    ).rejects.toThrow("upstream failed");
  });
});
