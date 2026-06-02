import { afterEach, describe, expect } from "bun:test"
import path from "node:path"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Exit, Layer } from "effect"
import { Config } from "../../src/config/config"
import { InstanceLayer } from "../../src/project/instance-layer"
import { InstanceStore } from "../../src/project/instance-store"
import { disposeAllInstances, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(InstanceLayer.layer, Config.defaultLayer, CrossSpawnSpawner.defaultLayer))

afterEach(async () => {
  await disposeAllInstances()
})

describe("config-derived command reload", () => {
  it.live("adding a command .md file is reflected after reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const store = yield* InstanceStore.Service

      const commandsDir = path.join(directory, ".opencode", "commands")
      yield* Effect.promise(() => import("node:fs").then((fs) => fs.promises.mkdir(commandsDir, { recursive: true })))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(commandsDir, "test.md"),
          `---
description: Test command
---
Hello from test command`,
        ),
      )

      yield* store.provide({ directory }, Effect.void)
      yield* store.reload({ directory })

      const config = yield* store.provide({ directory }, Config.use.get())
      expect(config.command?.["test"]).toBeDefined()
      expect(config.command?.["test"]?.description).toBe("Test command")
      expect(config.command?.["test"]?.template).toBe("Hello from test command")
    }),
  )

  it.live("removing a command .md file is reflected after reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const store = yield* InstanceStore.Service

      const commandsDir = path.join(directory, ".opencode", "commands")
      yield* Effect.promise(() => import("node:fs").then((fs) => fs.promises.mkdir(commandsDir, { recursive: true })))
      const commandFile = path.join(commandsDir, "test.md")
      yield* Effect.promise(() =>
        Bun.write(
          commandFile,
          `---
description: Test command
---
Hello from test command`,
        ),
      )

      yield* store.provide({ directory }, Effect.void)
      yield* store.reload({ directory })

      const configBefore = yield* store.provide({ directory }, Config.use.get())
      expect(configBefore.command?.["test"]).toBeDefined()

      yield* Effect.promise(() => import("node:fs").then((fs) => fs.promises.unlink(commandFile)))
      yield* store.reload({ directory })

      const configAfter = yield* store.provide({ directory }, Config.use.get())
      expect(configAfter.command?.["test"]).toBeUndefined()
    }),
  )
})

describe("invalid config atomicity", () => {
  it.live("invalid JSON config fails reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const store = yield* InstanceStore.Service

      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
          }),
        ),
      )

      yield* store.provide({ directory }, Effect.void)

      yield* Effect.promise(() => Bun.write(path.join(directory, "opencode.json"), "{ invalid json }"))

      const exit = yield* store.reload({ directory }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.live("schema-invalid config fails reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const store = yield* InstanceStore.Service

      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
          }),
        ),
      )

      yield* store.provide({ directory }, Effect.void)

      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            command: {
              bad: {
                description: "invalid command",
              },
            },
          }),
        ),
      )

      const exit = yield* store.reload({ directory }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.live("invalid command markdown fails reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const store = yield* InstanceStore.Service

      const commandsDir = path.join(directory, ".opencode", "commands")
      yield* Effect.promise(() => import("node:fs").then((fs) => fs.promises.mkdir(commandsDir, { recursive: true })))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(commandsDir, "good.md"),
          `---
description: Good command
---
Hello from good command`,
        ),
      )

      yield* store.provide({ directory }, Effect.void)

      yield* Effect.promise(() =>
        Bun.write(
          path.join(commandsDir, "bad.md"),
          `---
subtask: maybe
---
Hello from bad command`,
        ),
      )

      const exit = yield* store.reload({ directory }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.live("session can submit prompt after failed reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const store = yield* InstanceStore.Service

      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
          }),
        ),
      )

      yield* store.provide({ directory }, Effect.void)

      yield* Effect.promise(() => Bun.write(path.join(directory, "opencode.json"), "{ invalid json }"))

      const exit = yield* store.reload({ directory }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)

      const result = yield* store.provide({ directory }, Effect.succeed("prompt succeeded"))
      expect(result).toBe("prompt succeeded")
    }),
  )
})
