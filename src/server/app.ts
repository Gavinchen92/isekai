import cors from "@fastify/cors";
import fastify from "fastify";
import {
  AdventureCandidateGenerationRequestSchema,
  CreateAdventureRequestSchema,
  CreateSessionRequestSchema,
  CreateTurnRequestSchema
} from "../domain";
import { generateAdventureCandidatePreviews } from "../services/adventure-candidates";
import { createAdventure } from "../services/adventures";
import { listJourneyMemory } from "../services/journey-memory";
import { createSession, getSession } from "../services/sessions";
import { createTurn, refreshJourneyMemoryForSession } from "../services/turns";
import { listWorldSeedPresets } from "../services/world-seeds";
import { createHealthResponse } from "../shared/health";
import { appLogger, createLogTimer } from "../shared/logger";

export function createServer() {
  const server = fastify({
    loggerInstance: appLogger
  });

  void server.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
  });

  server.get("/api/health", async () => createHealthResponse());
  server.get("/api/world-seeds", async () => listWorldSeedPresets());
  server.post("/api/adventure-candidates", async (request, reply) => {
    const parsedRequest = AdventureCandidateGenerationRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: "Invalid adventure candidate request",
        issues: parsedRequest.error.flatten().fieldErrors
      });
    }

    const getDurationMs = createLogTimer();
    request.log.info(
      {
        candidateCount: parsedRequest.data.candidateCount,
        event: "adventure_candidate_generation_started",
        provider: process.env.GM_PROVIDER ?? "mock",
        requestId: request.id,
        worldSeedId: parsedRequest.data.worldSeedId
      },
      "adventure_candidate_generation_started"
    );

    try {
      const candidates = await generateAdventureCandidatePreviews(parsedRequest.data);

      request.log.info(
        {
          candidateCount: candidates.length,
          durationMs: getDurationMs(),
          event: "adventure_candidate_generation_completed",
          provider: process.env.GM_PROVIDER ?? "mock",
          requestId: request.id,
          worldSeedId: parsedRequest.data.worldSeedId
        },
        "adventure_candidate_generation_completed"
      );

      return candidates;
    } catch (error: unknown) {
      request.log.error(
        {
          durationMs: getDurationMs(),
          err: error,
          event: "adventure_candidate_generation_failed",
          provider: process.env.GM_PROVIDER ?? "mock",
          requestId: request.id,
          worldSeedId: parsedRequest.data.worldSeedId
        },
        "adventure_candidate_generation_failed"
      );

      return reply.status(502).send({
        error: "Adventure candidate generation failed"
      });
    }
  });
  server.post("/api/adventures", async (request, reply) => {
    const parsedRequest = CreateAdventureRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: "Invalid adventure creation request",
        issues: parsedRequest.error.flatten().fieldErrors
      });
    }

    try {
      return createAdventure(parsedRequest.data);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("adventure candidate not found")) {
        return reply.status(404).send({
          error: "Adventure candidate not found"
        });
      }

      if (
        error instanceof Error &&
        error.message.includes("adventure candidate does not belong")
      ) {
        return reply.status(400).send({
          error: "Adventure candidate does not belong to world seed"
        });
      }

      throw error;
    }
  });
  server.post("/api/sessions", async (request, reply) => {
    const parsedRequest = CreateSessionRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: "Invalid session creation request",
        issues: parsedRequest.error.flatten().fieldErrors
      });
    }

    try {
      return createSession(parsedRequest.data);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("adventure not found")) {
        return reply.status(404).send({
          error: "Adventure not found"
        });
      }

      throw error;
    }
  });
  server.get("/api/sessions/:sessionId/journey-memory", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = getSession(sessionId);

    if (!session) {
      return reply.status(404).send({
        error: "Session not found"
      });
    }

    return listJourneyMemory(sessionId);
  });
  server.post("/api/sessions/:sessionId/journey-memory/extract", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      return refreshJourneyMemoryForSession(sessionId);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("session not found")) {
        return reply.status(404).send({
          error: "Session not found"
        });
      }

      throw error;
    }
  });
  server.post("/api/turns", async (request, reply) => {
    const parsedRequest = CreateTurnRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: "Invalid turn request",
        issues: parsedRequest.error.flatten().fieldErrors
      });
    }

    const getDurationMs = createLogTimer();
    request.log.info(
      {
        event: "turn_generation_started",
        inputKind: parsedRequest.data.inputKind,
        requestId: request.id,
        sessionId: parsedRequest.data.sessionId
      },
      "turn_generation_started"
    );

    try {
      const turn = await createTurn(parsedRequest.data);

      request.log.info(
        {
          durationMs: getDurationMs(),
          event: "turn_generation_completed",
          messageCount: turn.messages.length,
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId,
          suggestedMoveCount: turn.suggestedMoves.length
        },
        "turn_generation_completed"
      );

      return turn;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("session not found")) {
        return reply.status(404).send({
          error: "Session not found"
        });
      }

      request.log.error(
        {
          durationMs: getDurationMs(),
          err: error,
          event: "turn_generation_failed",
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId
        },
        "turn_generation_failed"
      );
      throw error;
    }
  });

  return server;
}
