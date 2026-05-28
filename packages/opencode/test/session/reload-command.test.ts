import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProjectID } from "../../src/project/schema"
import { ReloadGuard } from "../../src/project/reload-guard"
import { Permission } from "../../src/permission"
import { Question } from "../../src/question"
import { SessionStatus } from "../../src/session/status"
import { SessionID } from "../../src/session/schema"
import { SessionPrompt } from "../../src/session/prompt"
import { Session } from "../../src/session/session"
import { provideInstanceEffect, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const testSessionID = SessionID.make("ses_test")

const stubState = {
  sessions: new Map<SessionID, SessionStatus.Info>(),
  permissions: [] as Permission.Request[],
  questions: [] as Question.Request[],
  reloads: 0,
}

function resetStubs() {
  stubState.sessions = new Map()
  stubState.permissions = []
  stubState.questions = []
  stubState.reloads = 0
}

const sessionStatusLayer = Layer.mock(SessionStatus.Service)({
  list: () => Effect.sync(() => new Map(stubState.sessions)),
})

const permissionLayer = Layer.mock(Permission.Service)({
  list: () => Effect.sync(() => stubState.permissions),
})

const questionLayer = Layer.mock(Question.Service)({
  list: () => Effect.sync(() => stubState.questions),
})

const reloadGuardLayer = ReloadGuard.layer.pipe(
  Layer.provide(sessionStatusLayer),
  Layer.provide(permissionLayer),
  Layer.provide(questionLayer),
)

const sessionLayer = Layer.mock(Session.Service)({
  get: () =>
    Effect.succeed({
      id: testSessionID,
      projectID: ProjectID.global,
      directory: "/tmp/opencode-test",
    } as Session.Info),
})

const promptLayer = SessionPrompt.layer.pipe(Layer.provide(sessionLayer), Layer.provide(reloadGuardLayer))

const it = testEffect(reloadGuardLayer)
const promptIt = testEffect(Layer.mergeAll(promptLayer, CrossSpawnSpawner.defaultLayer))

describe("reload guard", () => {
  it.effect("allows reload when no busy state exists", () =>
    Effect.gen(function* () {
      resetStubs()
      const guard = yield* ReloadGuard.Service
      const result = yield* guard.run(Effect.succeed("reloaded"))
      expect(result).toBe("reloaded")
    }),
  )

  it.effect("rejects reload while session is busy", () =>
    Effect.gen(function* () {
      resetStubs()
      stubState.sessions = new Map([[testSessionID, { type: "busy" as const }]])
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err).toBeInstanceOf(ReloadGuard.BusyError)
        expect((err as Error).message).toBe(ReloadGuard.BUSY_MESSAGE)
      }
    }),
  )

  it.effect("rejects reload while session is retrying", () =>
    Effect.gen(function* () {
      resetStubs()
      stubState.sessions = new Map([
        [
          testSessionID,
          {
            type: "retry" as const,
            attempt: 1,
            message: "retrying",
            next: 0,
          },
        ],
      ])
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err).toBeInstanceOf(ReloadGuard.BusyError)
      }
    }),
  )

  it.effect("rejects reload while permission is pending", () =>
    Effect.gen(function* () {
      resetStubs()
      stubState.permissions = [
        {
          id: "perm-1",
          sessionID: testSessionID,
          permission: "test",
          patterns: [],
          metadata: {},
          always: [],
        } as unknown as Permission.Request,
      ]
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err).toBeInstanceOf(ReloadGuard.BusyError)
      }
    }),
  )

  it.effect("rejects reload while question is pending", () =>
    Effect.gen(function* () {
      resetStubs()
      stubState.questions = [
        {
          id: "que-1",
          sessionID: testSessionID,
          questions: [],
        } as unknown as Question.Request,
      ]
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err).toBeInstanceOf(ReloadGuard.BusyError)
      }
    }),
  )
})

describe("reload command", () => {
  promptIt.effect("executes bare reload without model request", () =>
    Effect.gen(function* () {
      resetStubs()
      const directory = yield* tmpdirScoped()
      const prompt = yield* SessionPrompt.Service
      const result = yield* prompt
        .command({
          sessionID: testSessionID,
          command: "reload",
          arguments: "   ",
        })
        .pipe(provideInstanceEffect(directory))

      expect(result.info.role).toBe("assistant")
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]?.type).toBe("text")
      if (result.parts[0]?.type === "text") expect(result.parts[0].text).toBe("Reloaded configuration.")
    }),
  )

  promptIt.effect("rejects reload arguments", () =>
    Effect.gen(function* () {
      resetStubs()
      const directory = yield* tmpdirScoped()
      const prompt = yield* SessionPrompt.Service
      const result = yield* prompt
        .command({
          sessionID: testSessionID,
          command: "reload",
          arguments: "all",
        })
        .pipe(provideInstanceEffect(directory))

      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]?.type).toBe("text")
      if (result.parts[0]?.type === "text") expect(result.parts[0].text).toBe("/reload does not accept arguments.")
    }),
  )
})
