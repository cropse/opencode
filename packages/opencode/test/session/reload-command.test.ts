import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceStore, type LoadInput } from "../../src/project/instance-store"
import { ProjectID } from "../../src/project/schema"
import { ReloadGuard } from "../../src/project/reload-guard"
import { Permission } from "../../src/permission"
import { Question } from "../../src/question"
import { SessionStatus } from "../../src/session/status"
import { SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const testSessionID = SessionID.make("ses_test")

const stubState = {
  sessions: new Map<SessionID, SessionStatus.Info>(),
  permissions: [] as Permission.Request[],
  questions: [] as Question.Request[],
}

function resetStubs() {
  stubState.sessions = new Map()
  stubState.permissions = []
  stubState.questions = []
}

const it = testEffect(
  ReloadGuard.layer.pipe(
    Layer.provide(Layer.mock(SessionStatus.Service)({ list: () => Effect.sync(() => new Map(stubState.sessions)) })),
    Layer.provide(Layer.mock(Permission.Service)({ list: () => Effect.sync(() => stubState.permissions) })),
    Layer.provide(Layer.mock(Question.Service)({ list: () => Effect.sync(() => stubState.questions) })),
  ),
)

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
        [testSessionID, { type: "retry" as const, attempt: 1, message: "retrying", next: 0 }],
      ])
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBeInstanceOf(ReloadGuard.BusyError)
      }
    }),
  )

  it.effect("rejects reload while permission is pending", () =>
    Effect.gen(function* () {
      resetStubs()
      stubState.permissions = [
        { id: "perm-1", sessionID: testSessionID, permission: "test", patterns: [], metadata: {}, always: [] } as unknown as Permission.Request,
      ]
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBeInstanceOf(ReloadGuard.BusyError)
      }
    }),
  )

  it.effect("rejects reload while question is pending", () =>
    Effect.gen(function* () {
      resetStubs()
      stubState.questions = [
        { id: "que-1", sessionID: testSessionID, questions: [] } as unknown as Question.Request,
      ]
      const guard = yield* ReloadGuard.Service
      const exit = yield* guard.run(Effect.succeed("reloaded")).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBeInstanceOf(ReloadGuard.BusyError)
      }
    }),
  )
})
