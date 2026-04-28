import { describe, expect, it } from "vitest";
import { HealthResponseSchema, createHealthResponse } from "./health";

describe("createHealthResponse", () => {
  it("returns a schema-valid health payload", () => {
    const payload = createHealthResponse(new Date("2026-04-27T00:00:00.000Z"));

    expect(HealthResponseSchema.parse(payload)).toEqual({
      ok: true,
      service: "isekai",
      timestamp: "2026-04-27T00:00:00.000Z"
    });
  });
});
