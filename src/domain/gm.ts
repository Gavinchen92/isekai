import { z } from "zod";
import { StoryActNameSchema } from "./adventure";
import { JourneyMemoryEntryTypeSchema, JourneyMemoryEntryVisibilitySchema } from "./journey-memory";
import { isResultClaim } from "./runtime";

export const GmSuggestedMoveDraftSchema = z
  .object({
    label: z.string().min(1),
    intent: z.string().min(1),
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
    tags: z.array(z.string().min(1)).default([])
  })
  .refine((move) => !isResultClaim(move.label) && !isResultClaim(move.intent), {
    message: "GM suggested moves must describe attempts, not successful outcomes"
  });

export const GmJourneyMemoryConfidenceSchema = z.enum(["low", "medium", "high"]);

export const GmJourneyMemoryCandidateSchema = z.object({
  key: z.string().min(1),
  type: JourneyMemoryEntryTypeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string().min(1)),
  visibility: JourneyMemoryEntryVisibilitySchema,
  confidence: GmJourneyMemoryConfidenceSchema,
  relatedNpcIds: z.array(z.string().min(1)).default([]),
  relatedLocationIds: z.array(z.string().min(1)).default([])
});

export const GmInternalStatePatchSchema = z.object({
  currentAct: StoryActNameSchema.optional(),
  flags: z.array(z.string().min(1)).default([]),
  privateNotes: z.array(z.string().min(1)).default([])
});

export const GmTurnResultSchema = z.object({
  narration: z.string().min(1),
  suggestedMoves: z.array(GmSuggestedMoveDraftSchema).min(1).max(3),
  journeyMemoryCandidates: z.array(GmJourneyMemoryCandidateSchema).default([]),
  internalStatePatch: GmInternalStatePatchSchema.default({
    flags: [],
    privateNotes: []
  })
});

export const GmPromptMessageSchema = z.object({
  role: z.enum(["system", "user"]),
  content: z.string().min(1)
});

export const GmPromptMessageListSchema = z.array(GmPromptMessageSchema).min(2).max(2);

export type GmSuggestedMoveDraft = z.infer<typeof GmSuggestedMoveDraftSchema>;
export type GmJourneyMemoryConfidence = z.infer<typeof GmJourneyMemoryConfidenceSchema>;
export type GmJourneyMemoryCandidate = z.infer<typeof GmJourneyMemoryCandidateSchema>;
export type GmInternalStatePatch = z.infer<typeof GmInternalStatePatchSchema>;
export type GmTurnResult = z.infer<typeof GmTurnResultSchema>;
export type GmPromptMessage = z.infer<typeof GmPromptMessageSchema>;
