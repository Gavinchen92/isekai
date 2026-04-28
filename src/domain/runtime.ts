import { z } from "zod";
import { StoryActNameSchema } from "./adventure";

export const PlayerInputIntentSchema = z.enum([
  "character_action",
  "character_speech",
  "player_strategy",
  "ooc_instruction",
  "world_override_attempt"
]);

export const MessageInputKindSchema = z.enum(["free", "suggested-move", "continue", "ooc"]);

export const InputIntentClassificationSchema = z.object({
  intent: PlayerInputIntentSchema,
  normalizedAttempt: z.string().min(1),
  isResultClaim: z.boolean(),
  confidence: z.enum(["low", "medium", "high"])
});

export const MessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  inputKind: MessageInputKindSchema.optional(),
  inferredIntent: PlayerInputIntentSchema.optional(),
  content: z.string().min(1),
  parentMessageId: z.string().min(1).optional(),
  createdAt: z.string().datetime()
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  adventureId: z.string().min(1),
  mode: z.enum(["chat", "visual-novel"]),
  dmEnabled: z.boolean(),
  branchParentId: z.string().min(1).optional(),
  currentAct: StoryActNameSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const CreateSessionRequestSchema = z.object({
  adventureId: z.string().min(1)
});

export const CreateTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
  inputKind: MessageInputKindSchema.default("free")
});

const resultClaimPatterns = [
  /^成功/u,
  /^已经/u,
  /^直接/u,
  /^立刻/u,
  /无限/u,
  /全部.*臣服/u,
  /说服.*并/u,
  /杀死/u,
  /^successfully\b/iu,
  /^already\b/iu
] as const;

const attemptPattern = /^(试图|尝试|设法|打算|准备|想要|玩家\s*(试图|尝试|设法|打算|准备|想要)|try to|attempt to)/iu;

export function isResultClaim(text: string): boolean {
  const normalized = text.trim();

  if (attemptPattern.test(normalized)) {
    return false;
  }

  return resultClaimPatterns.some((pattern) => pattern.test(normalized));
}

export const SuggestedMoveSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    sourceMessageId: z.string().min(1),
    label: z.string().min(1),
    intent: z.string().min(1),
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
    tags: z.array(z.string().min(1)),
    createdAt: z.string().datetime()
  })
  .refine((move) => !isResultClaim(move.label) && !isResultClaim(move.intent), {
    message: "suggested moves must describe attempts, not successful outcomes"
  });

export const TurnResponseSchema = z.object({
  messages: z.array(MessageSchema).length(2),
  suggestedMoves: z.array(SuggestedMoveSchema).min(1).max(3)
});

export const TurnStreamStartedEventSchema = z.object({
  type: z.literal("turn_started"),
  userMessage: MessageSchema
});

export const TurnStreamNarrationChunkEventSchema = z.object({
  type: z.literal("narration_chunk"),
  assistantMessageId: z.string().min(1),
  chunk: z.string().min(1)
});

export const TurnStreamSuggestedMovesReadyEventSchema = z.object({
  type: z.literal("suggested_moves_ready"),
  suggestedMoves: z.array(SuggestedMoveSchema).min(1).max(3)
});

export const TurnStreamCompletedEventSchema = z.object({
  type: z.literal("turn_completed"),
  turn: TurnResponseSchema
});

export const TurnStreamEventSchema = z.discriminatedUnion("type", [
  TurnStreamStartedEventSchema,
  TurnStreamNarrationChunkEventSchema,
  TurnStreamSuggestedMovesReadyEventSchema,
  TurnStreamCompletedEventSchema
]);

export type PlayerInputIntent = z.infer<typeof PlayerInputIntentSchema>;
export type MessageInputKind = z.infer<typeof MessageInputKindSchema>;
export type InputIntentClassification = z.infer<typeof InputIntentClassificationSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateTurnRequest = z.infer<typeof CreateTurnRequestSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type SuggestedMove = z.infer<typeof SuggestedMoveSchema>;
export type TurnResponse = z.infer<typeof TurnResponseSchema>;
export type TurnStreamEvent = z.infer<typeof TurnStreamEventSchema>;
