import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { PluginInput, ToolContext } from "@opencode-ai/plugin"
import plugin from "../../src/index"
import type { ImageSize } from "../../src/size"
import { PNG_BASE64, PNG_BUFFER } from "./fixtures"

// Capture so this file's env edits don't leak into other test files sharing the bun test process.
const ORIGINAL_AUTH_CONTENT = process.env.OPENCODE_AUTH_CONTENT
const originalFetch = globalThis.fetch
let dir: string

beforeEach(async () => {
  process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({ openai: { type: "oauth", access: "tok" } })
  dir = await mkdtemp(path.join(os.tmpdir(), "index-"))
})

afterEach(async () => {
  if (ORIGINAL_AUTH_CONTENT === undefined) {
    delete process.env.OPENCODE_AUTH_CONTENT
  } else {
    process.env.OPENCODE_AUTH_CONTENT = ORIGINAL_AUTH_CONTENT
  }
  globalThis.fetch = originalFetch
  await rm(dir, { recursive: true, force: true })
})

function imagesResponse(b64Json: string): Response {
  return new Response(JSON.stringify({ created: 0, data: [{ b64_json: b64Json }] }))
}

describe("gpt_imagegen execute", () => {
  test("saves the generated image under the context directory and reports it", async () => {
    const fetchMock = mock(async (_url: string, _init: RequestInit) => imagesResponse(PNG_BASE64))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const hooks = await plugin.server({} as PluginInput)
    const ctx = { directory: dir } as ToolContext
    const out = "cat.png"
    const size = "1672x941"

    const result = await hooks.tool?.gpt_imagegen?.execute({ prompt: "a cat", out, quality: "auto", size }, ctx)

    const savedPath = path.join(dir, out)
    expect(await readFile(savedPath)).toEqual(PNG_BUFFER)
    // PNG_BASE64 is a 1x1 image. The message reports the size of the saved image, not the requested size.
    expect(result).toEqual({
      output: `Generated image saved to ${savedPath}. The image is 1x1 pixels.`,
      metadata: { out: savedPath, versioned: false, billing: "subscription" },
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body as string).prompt).toBe(
      "a cat Generate the image with a width of 1672 pixels and a height of 941 pixels (16:9 aspect ratio).",
    )
  })

  test("rejects an unsupported size without calling the backend", async () => {
    const fetchMock = mock(async () => new Response(""))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const hooks = await plugin.server({} as PluginInput)
    const ctx = { directory: dir } as ToolContext
    // Some OpenCode versions pass arguments to execute without validating them against the schema.
    const size = "1280x720" as ImageSize

    const act = hooks.tool?.gpt_imagegen?.execute({ prompt: "a cat", out: "cat.png", quality: "auto", size }, ctx)

    await expect(act).rejects.toThrow(`Unsupported size "${size}".`)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
