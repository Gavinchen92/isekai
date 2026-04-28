import { z } from "zod";

export const WorldSeedIdSchema = z.enum([
  "isekai",
  "medieval",
  "ancient-china",
  "sengoku-japan"
]);

export const WorldSeedPresetSchema = z.object({
  id: WorldSeedIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  genreTags: z.array(z.string().min(1)).min(1),
  defaultTone: z.string().min(1),
  generationPrompt: z.string().min(1)
});

export const WorldSeedPresetListSchema = z.array(WorldSeedPresetSchema).length(4);

export type WorldSeedId = z.infer<typeof WorldSeedIdSchema>;
export type WorldSeedPreset = z.infer<typeof WorldSeedPresetSchema>;
