import { afterEach, describe, expect } from "bun:test"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Effect, Layer } from "effect"
import { InstanceBootstrap } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { Snapshot } from "../../src/snapshot"
import { Server } from "../../src/server/server"
import * as Log from "@opencode-ai/core/util/log"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

void Log.init({ print: false })

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const testInstanceStore = InstanceStore.defaultLayer.pipe(Layer.provide(noopBootstrap))

const it = testEffect(Layer.mergeAll(AppFileSystem.defaultLayer, Snapshot.defaultLayer, testInstanceStore))

function request(directory: string, url: string, init: RequestInit = {}) {
  return Effect.promise(() => {
    const headers = new Headers(init.headers)
    headers.set("x-opencode-directory", directory)
    return Promise.resolve(Server.Default().app.request(url, { ...init, headers }))
  })
}

function json<T>(response: Response) {
  return Effect.promise(() => response.json() as Promise<T>)
}

describe("project.sidebar endpoints", () => {
  it.instance(
    "GET /project/sidebar returns empty array for fresh database",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const res = yield* request(tmp.directory, "/project/sidebar")
        expect(res.status).toBe(200)
        expect(yield* json(res)).toEqual([])
      }),
    30_000,
  )

  it.instance("PUT /project/sidebar replaces entries then GET returns them", () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance
      const entries = [
        { projectID: null, worktree: "/a", expanded: true },
        { projectID: null, worktree: "/b", expanded: false },
      ]
      const put = yield* request(tmp.directory, "/project/sidebar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entries),
      })
      expect(put.status).toBe(200)

      const res = yield* request(tmp.directory, "/project/sidebar")
      expect(res.status).toBe(200)
      const items = yield* json<Array<{ worktree: string; expanded: boolean; order: number }>>(res)
      expect(items).toHaveLength(2)
      expect(items[0].worktree).toBe("/a")
      expect(items[0].expanded).toBe(true)
      expect(items[0].order).toBe(0)
      expect(items[1].worktree).toBe("/b")
      expect(items[1].expanded).toBe(false)
      expect(items[1].order).toBe(1)
    }),
  )

  it.instance("PUT /project/sidebar respects explicit order", () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance
      const entries = [
        { projectID: null, worktree: "/b", expanded: false, order: 10 },
        { projectID: null, worktree: "/a", expanded: true, order: 5 },
      ]
      const put = yield* request(tmp.directory, "/project/sidebar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entries),
      })
      expect(put.status).toBe(200)

      const res = yield* request(tmp.directory, "/project/sidebar")
      expect(res.status).toBe(200)
      const items = yield* json<Array<{ worktree: string; expanded: boolean; order: number }>>(res)
      expect(items).toHaveLength(2)
      expect(items[0].worktree).toBe("/a")
      expect(items[0].order).toBe(5)
      expect(items[1].worktree).toBe("/b")
      expect(items[1].order).toBe(10)
    }),
  )

  it.instance("PUT /project/sidebar replaces previous entries", () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance

      yield* request(tmp.directory, "/project/sidebar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          { projectID: null, worktree: "/a", expanded: true },
          { projectID: null, worktree: "/b", expanded: true },
        ]),
      })

      yield* request(tmp.directory, "/project/sidebar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{ projectID: null, worktree: "/c", expanded: false }]),
      })

      const res = yield* request(tmp.directory, "/project/sidebar")
      const items = yield* json<Array<{ worktree: string; expanded: boolean; order: number }>>(res)
      expect(items).toHaveLength(1)
      expect(items[0].worktree).toBe("/c")
    }),
  )
})
