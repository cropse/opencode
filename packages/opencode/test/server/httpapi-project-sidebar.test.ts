import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Config, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { ProjectPaths } from "../../src/server/routes/instance/httpapi/groups/project"
import { ProjectSidebarTable } from "../../src/project/project-sidebar.sql"
import { Database } from "../../src/storage/db"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  { disableListenLog: true, disableLogger: true },
)

const httpApiServerLayer = servedRoutes.pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)

const it = testEffect(httpApiServerLayer)

const directoryHeader = (dir: string) => HttpClientRequest.setHeader("x-opencode-directory", dir)

describe("project sidebar HttpApi", () => {
  it.live("returns empty sidebar for fresh database", () =>
    Effect.gen(function* () {
      yield* Effect.sync(() => Database.use((db) => db.delete(ProjectSidebarTable).run()))

      const dir = yield* tmpdirScoped({ git: true })
      const response = yield* HttpClientRequest.get(ProjectPaths.sidebar).pipe(
        directoryHeader(dir),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      const body = yield* response.json
      expect(body).toEqual([])
    }),
  )

  it.live("persists sidebar entries via PUT and retrieves them via GET", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })

      const entries = [
        { projectID: null, worktree: "/tmp/sidebar-a", expanded: true },
        { projectID: null, worktree: "/tmp/sidebar-b", expanded: false },
      ]

      const putResponse = yield* HttpClientRequest.put(ProjectPaths.sidebar).pipe(
        directoryHeader(dir),
        HttpClientRequest.bodyJson(entries),
        Effect.flatMap(HttpClient.execute),
      )

      expect(putResponse.status).toBe(200)
      const putBody: Array<Record<string, unknown>> = yield* putResponse.json as unknown as Array<Record<string, unknown>>
      expect(putBody).toHaveLength(2)
      expect(putBody[0] as Record<string, unknown>).toMatchObject({ worktree: "/tmp/sidebar-a", expanded: true, order: 0 })
      expect(putBody[1] as Record<string, unknown>).toMatchObject({ worktree: "/tmp/sidebar-b", expanded: false, order: 1 })

      const getResponse = yield* HttpClientRequest.get(ProjectPaths.sidebar).pipe(
        directoryHeader(dir),
        HttpClient.execute,
      )

      expect(getResponse.status).toBe(200)
      const getBody = yield* getResponse.json
      expect(getBody).toEqual(putBody)
    }),
  )

  it.live("replaces entries on subsequent PUT", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })

      yield* HttpClientRequest.put(ProjectPaths.sidebar).pipe(
        directoryHeader(dir),
        HttpClientRequest.bodyJson([
          { projectID: null, worktree: "/tmp/first", expanded: true },
          { projectID: null, worktree: "/tmp/second", expanded: false },
        ]),
        Effect.flatMap(HttpClient.execute),
      )

      const reordered = [
        { projectID: null, worktree: "/tmp/second", expanded: true },
        { projectID: null, worktree: "/tmp/first", expanded: false },
        { projectID: null, worktree: "/tmp/third", expanded: true },
      ]

      const putResponse = yield* HttpClientRequest.put(ProjectPaths.sidebar).pipe(
        directoryHeader(dir),
        HttpClientRequest.bodyJson(reordered),
        Effect.flatMap(HttpClient.execute),
      )

      expect(putResponse.status).toBe(200)
      const putBody2: Array<Record<string, unknown>> = yield* putResponse.json as unknown as Array<Record<string, unknown>>
      expect(putBody2).toHaveLength(3)
      expect(putBody2[0]).toMatchObject({ worktree: "/tmp/second", expanded: true, order: 0 })
      expect(putBody2[1]).toMatchObject({ worktree: "/tmp/first", expanded: false, order: 1 })
      expect(putBody2[2]).toMatchObject({ worktree: "/tmp/third", expanded: true, order: 2 })
    }),
  )

  it.live("existing project endpoints still work", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const response = yield* HttpClientRequest.get(ProjectPaths.list).pipe(
        directoryHeader(dir),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      const body = yield* response.json
      expect(Array.isArray(body)).toBe(true)
    }),
  )
})
