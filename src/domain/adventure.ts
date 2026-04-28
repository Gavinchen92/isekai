import { z } from "zod";
import { WorldSeedIdSchema } from "./world-seed";

export const AdventureToneSchema = z.enum(["serious", "light", "dark", "heroic", "mystery"]);
export const AdventureIntensitySchema = z.enum(["low", "medium", "high"]);

export const AdventureCandidateGenerationRequestSchema = z.object({
  worldSeedId: WorldSeedIdSchema,
  tone: AdventureToneSchema.optional(),
  dangerLevel: AdventureIntensitySchema.optional(),
  fantasyLevel: AdventureIntensitySchema.optional(),
  playerRoleHint: z.string().min(1).optional(),
  candidateCount: z.number().int().min(1).max(3).default(3)
});

export const StoryActNameSchema = z.enum([
  "act1",
  "act2",
  "act3",
  "act4",
  "ending",
  "epilogue"
]);

export const StoryActSchema = z.object({
  name: StoryActNameSchema,
  title: z.string().min(1),
  goal: z.string().min(1),
  transitionHint: z.string().min(1)
});

export const StoryArcSchema = z.object({
  acts: z.array(StoryActSchema).min(5)
});

export const EndingSeedSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  tone: z.enum(["triumphant", "bittersweet", "tragic", "ambiguous"])
});

export const PlayerSetupOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  startingGoal: z.string().min(1)
});

export const PlayerSetupOptionPreviewSchema = PlayerSetupOptionSchema.pick({
  id: true,
  title: true,
  description: true
});

export const NpcSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  publicDescription: z.string().min(1),
  privateMotivation: z.string().min(1).optional()
});

export const FactionSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  publicDescription: z.string().min(1),
  hiddenAgenda: z.string().min(1).optional()
});

export const LocationSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1)
});

export const AdventureCandidateSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  title: z.string().min(1),
  pitch: z.string().min(1),
  playerSetupOptions: z.array(PlayerSetupOptionSchema).min(2),
  openingScene: z.string().min(1),
  worldPremise: z.string().min(1),
  mainConflict: z.string().min(1),
  storyArc: StoryArcSchema,
  winCondition: z.string().min(1),
  lossCondition: z.string().min(1),
  endingSeeds: z.array(EndingSeedSchema).min(2),
  endgameTriggers: z.array(z.string().min(1)).min(1),
  factions: z.array(FactionSeedSchema),
  locations: z.array(LocationSeedSchema).min(1),
  npcSeeds: z.array(NpcSeedSchema).min(1),
  toneGuidelines: z.string().min(1),
  hiddenGmNotes: z.string().min(1),
  runtimePrompt: z.string().min(1),
  tags: z.array(z.string().min(1))
});

export const AdventureCandidateListSchema = z.array(AdventureCandidateSchema).min(1).max(3);

export const AdventureCandidatePreviewSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  title: z.string().min(1),
  teaser: z.string().min(1),
  playerSetupOptions: z.array(PlayerSetupOptionPreviewSchema).min(2),
  tags: z.array(z.string().min(1))
});

export const AdventureCandidatePreviewListSchema = z
  .array(AdventureCandidatePreviewSchema)
  .min(1)
  .max(3);

export const AdventureSchema = AdventureCandidateSchema.omit({
  requestId: true
}).extend({
  sourceCandidateId: z.string().min(1),
  worldSeedId: WorldSeedIdSchema,
  currentAct: StoryActNameSchema,
  selectedPlayerSetupId: z.string().min(1).optional(),
  endingSummary: z.string().min(1).optional(),
  endedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const CreateAdventureRequestSchema = z.object({
  worldSeedId: WorldSeedIdSchema,
  candidateId: z.string().min(1),
  selectedPlayerSetupId: z.string().min(1).optional()
});

export type StoryActName = z.infer<typeof StoryActNameSchema>;
export type AdventureTone = z.infer<typeof AdventureToneSchema>;
export type AdventureIntensity = z.infer<typeof AdventureIntensitySchema>;
export type AdventureCandidateGenerationRequest = z.infer<
  typeof AdventureCandidateGenerationRequestSchema
>;
export type StoryAct = z.infer<typeof StoryActSchema>;
export type StoryArc = z.infer<typeof StoryArcSchema>;
export type EndingSeed = z.infer<typeof EndingSeedSchema>;
export type AdventureCandidate = z.infer<typeof AdventureCandidateSchema>;
export type AdventureCandidatePreview = z.infer<typeof AdventureCandidatePreviewSchema>;
export type Adventure = z.infer<typeof AdventureSchema>;
export type CreateAdventureRequest = z.infer<typeof CreateAdventureRequestSchema>;
