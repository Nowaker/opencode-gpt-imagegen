import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import os from "node:os"
import type { PluginInput, ToolContext } from "@opencode-ai/plugin"
import plugin from "../../src/index"
import type { ImageSize } from "../../src/size"

// Capture so this file's env edits don't leak into other test files sharing the bun test process.
const ORIGINAL_AUTH_CONTENT = process.env.OPENCODE_AUTH_CONTENT
const originalFetch = globalThis.fetch

beforeEach(() => {
  process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({ openai: { type: "oauth", access: "tok" } })
})

afterEach(() => {
  if (ORIGINAL_AUTH_CONTENT === undefined) {
    delete process.env.OPENCODE_AUTH_CONTENT
  } else {
    process.env.OPENCODE_AUTH_CONTENT = ORIGINAL_AUTH_CONTENT
  }
  globalThis.fetch = originalFetch
})

describe("gpt_imagegen execute", () => {
  test("rejects an unsupported size without calling the backend", async () => {
    const fetchMock = mock(async () => new Response(""))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const hooks = await plugin.server({} as PluginInput)
    const ctx = { directory: os.tmpdir() } as ToolContext
    // Some OpenCode versions pass arguments to execute without validating them against the schema.
    const size = "1280x720" as ImageSize

    const act = hooks.tool?.gpt_imagegen?.execute({ prompt: "a cat", out: "cat.png", quality: "auto", size }, ctx)

    await expect(act).rejects.toThrow(`Unsupported size "${size}".`)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
