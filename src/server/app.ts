import cors from "@fastify/cors";
import fastify, { type FastifyReply } from "fastify";
import {
  AdventureCandidateGenerationRequestSchema,
  CreateAdventureRequestSchema,
  CreateSessionRequestSchema,
  CreateTurnRequestSchema
} from "../domain";
import { generateAdventureCandidatePreviews } from "../services/adventure-candidates";
import { createAdventure, getAdventure } from "../services/adventures";
import { listJourneyMemory } from "../services/journey-memory";
import { getLatestSessionSnapshot, getSessionSnapshot } from "../services/session-snapshots";
import { createSession, getSession } from "../services/sessions";
import { createTurn, createTurnStream, refreshJourneyMemoryForSession } from "../services/turns";
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
      const candidates = await generateAdventureCandidatePreviews(parsedRequest.data, {
        logContext: {
          operation: "adventure_candidate_preview_generation",
          requestId: request.id,
          worldSeedId: parsedRequest.data.worldSeedId
        },
        signal: createReplyAbortSignal(reply)
      });

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
      if (isAbortError(error)) {
        return reply.status(499).send({
          error: "Adventure candidate generation cancelled"
        });
      }

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
      return await createAdventure(parsedRequest.data, {
        logContext: {
          operation: "adventure_generation",
          requestId: request.id,
          worldSeedId: parsedRequest.data.worldSeedId
        },
        signal: createReplyAbortSignal(reply)
      });
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

      if (
        error instanceof Error &&
        error.message.includes("player setup option does not belong")
      ) {
        return reply.status(400).send({
          error: "Player setup option does not belong to adventure candidate"
        });
      }

      if (isAbortError(error)) {
        return reply.status(499).send({
          error: "Adventure generation cancelled"
        });
      }

      request.log.error(
        {
          err: error,
          event: "adventure_generation_failed",
          requestId: request.id,
          worldSeedId: parsedRequest.data.worldSeedId
        },
        "adventure_generation_failed"
      );

      return reply.status(502).send({
        error: "Adventure generation failed"
      });
    }
  });
  server.get("/api/adventures/:adventureId", async (request, reply) => {
    const { adventureId } = request.params as { adventureId: string };
    const adventure = getAdventure(adventureId);

    if (!adventure) {
      return reply.status(404).send({
        error: "Adventure not found"
      });
    }

    return adventure;
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
  server.get("/api/sessions/latest", async (_request, reply) => {
    const snapshot = getLatestSessionSnapshot();

    if (!snapshot) {
      return reply.status(404).send({
        error: "Session not found"
      });
    }

    return snapshot;
  });
  server.get("/api/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const snapshot = getSessionSnapshot(sessionId);

    if (!snapshot) {
      return reply.status(404).send({
        error: "Session not found"
      });
    }

    return snapshot;
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
      const turn = await createTurn(parsedRequest.data, {
        logContext: {
          operation: "turn_generation",
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId
        },
        onJourneyMemoryPostProcessSettled: (result) => {
          if (result.status === "completed") {
            request.log.info(
              {
                durationMs: result.durationMs,
                event: "turn_post_processing_completed",
                requestId: request.id,
                sessionId: parsedRequest.data.sessionId
              },
              "turn_post_processing_completed"
            );
            return;
          }

          request.log.error(
            {
              durationMs: result.durationMs,
              err: result.error,
              event: "turn_post_processing_failed",
              requestId: request.id,
              sessionId: parsedRequest.data.sessionId
            },
            "turn_post_processing_failed"
          );
        }
      });

      request.log.info(
        {
          mainResponseDurationMs: getDurationMs(),
          event: "turn_generation_completed",
          messageCount: turn.messages.length,
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId,
          suggestedMoveCount: turn.suggestedMoves.length
        },
        "turn_generation_completed"
      );

      return {
        ...turn,
        phase: "finalizing" as const
      };
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
  server.post("/api/turns/stream", async (request, reply) => {
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
        event: "turn_stream_started",
        inputKind: parsedRequest.data.inputKind,
        requestId: request.id,
        sessionId: parsedRequest.data.sessionId
      },
      "turn_stream_started"
    );

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const sendEvent = (event: unknown) => {
      if (!("type" in (event as Record<string, unknown>))) {
        return;
      }

      const eventType = String((event as { type: string }).type);
      reply.raw.write(`event: ${eventType}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of createTurnStream(parsedRequest.data, {
        logContext: {
          operation: "turn_stream",
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId
        }
      })) {
        sendEvent(event);
      }

      request.log.info(
        {
          durationMs: getDurationMs(),
          event: "turn_stream_completed",
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId
        },
        "turn_stream_completed"
      );
    } catch (error: unknown) {
      sendEvent({
        type: "turn_error",
        message: error instanceof Error ? error.message : "turn stream failed"
      });
      request.log.error(
        {
          durationMs: getDurationMs(),
          err: error,
          event: "turn_stream_failed",
          requestId: request.id,
          sessionId: parsedRequest.data.sessionId
        },
        "turn_stream_failed"
      );
    } finally {
      reply.raw.end();
    }
  });

  return server;
}

function createReplyAbortSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();

  reply.raw.once("close", () => {
    if (!reply.raw.writableEnded) {
      controller.abort(new DOMException("client disconnected", "AbortError"));
    }
  });

  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name: unknown }).name === "AbortError"
  );
}
