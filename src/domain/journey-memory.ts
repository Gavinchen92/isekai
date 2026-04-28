import { z } from "zod";

export const JourneyMemoryEntryTypeSchema = z.enum([
  "identity",
  "npc",
  "location",
  "relationship",
  "clue",
  "item"
]);

export const JourneyMemoryEntryVisibilitySchema = z.enum(["known", "uncertain"]);

export const JourneyMemoryEntrySchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: JourneyMemoryEntryTypeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string().min(1)),
  visibility: JourneyMemoryEntryVisibilitySchema,
  relatedNpcIds: z.array(z.string().min(1)),
  relatedLocationIds: z.array(z.string().min(1)),
  sourceMessageIds: z.array(z.string().min(1)),
  updatedAt: z.string().datetime()
});

export const JourneyMemoryEntryListSchema = z.array(JourneyMemoryEntrySchema);

export type JourneyMemoryEntryType = z.infer<typeof JourneyMemoryEntryTypeSchema>;
export type JourneyMemoryEntryVisibility = z.infer<typeof JourneyMemoryEntryVisibilitySchema>;
export type JourneyMemoryEntry = z.infer<typeof JourneyMemoryEntrySchema>;
