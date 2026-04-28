import { z } from "zod";

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("isekai"),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function createHealthResponse(now: Date = new Date()): HealthResponse {
  return HealthResponseSchema.parse({
    ok: true,
    service: "isekai",
    timestamp: now.toISOString()
  });
}
