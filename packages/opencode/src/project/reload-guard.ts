import { Context, Effect, Layer, Schema } from "effect"
import { SessionStatus } from "@/session/status"
import { Permission } from "@/permission"
import { Question } from "@/question"

export const BUSY_MESSAGE =
  "Cannot reload while a response, tool, permission, or question is active. Try again after the current work finishes."

export class BusyError extends Schema.TaggedErrorClass<BusyError>()("ReloadBusyError", {}) {
  override get message() {
    return BUSY_MESSAGE
  }
}

export interface Interface {
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | BusyError, R>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ReloadGuard") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const status = yield* SessionStatus.Service
    const permission = yield* Permission.Service
    const question = yield* Question.Service

    const isBusy = Effect.gen(function* () {
      const sessions = yield* status.list()
      for (const s of sessions.values()) {
        if (s.type === "busy") return true
      }
      const permissions = yield* permission.list()
      if (permissions.length > 0) return true
      const questions = yield* question.list()
      if (questions.length > 0) return true
      return false
    })

    const run = Effect.fn("ReloadGuard.run")(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
      if (yield* isBusy) {
        return yield* new BusyError()
      }
      return yield* effect
    })

    return Service.of({ run })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(SessionStatus.defaultLayer),
  Layer.provide(Permission.defaultLayer),
  Layer.provide(Question.defaultLayer),
)

export const atomicReload = <A, E, R>(
  loadNew: Effect.Effect<A, E, R>,
  disposePrevious: Effect.Effect<void>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const result = yield* loadNew
    yield* disposePrevious
    return result
  })

export * as ReloadGuard from "./reload-guard"
