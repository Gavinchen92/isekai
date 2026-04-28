import { z } from "zod";

export const AdventureLogEntrySchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.enum(["event", "decision", "discovery", "relationship"]),
  title: z.string().min(1),
  content: z.string().min(1),
  sourceMessageId: z.string().min(1).optional(),
  confirmed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const QuestLogEntrySchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["active", "completed", "failed", "unknown"]),
  description: z.string().min(1),
  objective: z.string().min(1).optional(),
  relatedNpcIds: z.array(z.string().min(1)),
  relatedLocationIds: z.array(z.string().min(1)),
  updatedAt: z.string().datetime()
});

export const CodexEntrySchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.enum(["npc", "location", "faction", "item", "concept"]),
  name: z.string().min(1),
  publicDescription: z.string().min(1),
  knownFacts: z.array(z.string().min(1)),
  sourceMessageIds: z.array(z.string().min(1)),
  updatedAt: z.string().datetime()
});

export type AdventureLogEntry = z.infer<typeof AdventureLogEntrySchema>;
export type QuestLogEntry = z.infer<typeof QuestLogEntrySchema>;
export type CodexEntry = z.infer<typeof CodexEntrySchema>;
