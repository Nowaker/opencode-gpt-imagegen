import type { Hooks, Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { loadOpenAIAuth } from "./auth"
import { callViaCodexImages } from "./codex"
import { readReferenceImages } from "./input-image"
import { saveGeneratedImage } from "./output-image"
import { IMAGE_SIZES, type ImageSize, SIZE_CHOICES } from "./size"

// https://developers.openai.com/api/docs/guides/image-generation
const argsShape = {
  prompt: tool.schema.string().describe("Description of the image to generate."),
  out: tool.schema
    .string()
    .describe("Output file path, relative to the project directory unless absolute. The plugin writes a PNG."),
  size: tool.schema
    .enum(Object.keys(IMAGE_SIZES) as [ImageSize, ...ImageSize[]], {
      error: (issue) =>
        issue.input == null
          ? `Missing size. Use one of: ${SIZE_CHOICES}.`
          : `Unsupported size "${issue.input}". Use one of: ${SIZE_CHOICES}.`,
    })
    .describe(
      [
        `Output size. Only these sizes can be generated: ${SIZE_CHOICES}.`,
        "Typical choices: 1672x941 for a 16:9 video thumbnail, 1254x1254 for a square icon, 941x1672 for a phone wallpaper.",
      ].join(" "),
    ),
  images: tool.schema
    .array(tool.schema.string())
    .nullish()
    .describe("Optional reference image paths, relative to the project directory unless absolute."),
}

// Some OpenCode versions (e.g. 1.18.34) do not validate plugin tool arguments before calling execute,
// so execute validates them against the same schema.
const argsSchema = tool.schema.object(argsShape)

const GptImagePlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  return {
    tool: {
      gpt_imagegen: tool({
        description: [
          "Generate raster images through the image generation endpoints of the ChatGPT Codex backend.",
          "Use for AI-created bitmap visuals such as photos, illustrations, textures, sprites, and mockups.",
          "Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas.",
          "Reference images may be attached through `images`; label each image's role inline in `prompt`, for example: 'Image 1: reference image'.",
          "For many distinct assets, invoke gpt_imagegen once per requested asset rather than relying on multi-image output; gpt_imagegen returns one image per call.",
          "Requires OpenCode to be authenticated with ChatGPT OAuth. Returns the absolute path of the saved PNG.",
          "Before generating, decide the size. If the user named a size that is not supported, or gave no size and the use does not clearly imply a shape, ask the user which size to use (with the question tool when available).",
          "In that question, offer every supported size as an option labeled like `1672x941 (16:9)`, put the one you recommend first with ` (Recommended)` appended to its label, and give each option a short description of what it suits.",
          "Do not add catch-all options such as 'Other' or 'Let me decide'.",
          "In the question text, say that other sizes cannot be generated directly and that the image can be resized or cropped to an exact size afterwards, for example with ImageMagick.",
          "If the use clearly implies a shape, such as a YouTube thumbnail or an app icon, pick the matching size without asking.",
          "The saved image can differ from the requested size by 1px, so do not promise exact pixel dimensions before generating. After generating, tell the user the size reported in the tool result.",
        ].join(" "),
        args: argsShape,
        async execute(rawArgs, ctx) {
          const parsed = argsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(tool.schema.prettifyError(parsed.error))
          }
          const args = parsed.data
          const auth = await loadOpenAIAuth()
          if (!auth) {
            throw new Error("OpenAI ChatGPT OAuth credentials not configured.")
          }

          const inputImageDataUrls = await readReferenceImages(args.images, ctx.directory)
          const base64 = await callViaCodexImages(auth, args, inputImageDataUrls)

          const { savedPath, versioned, message } = await saveGeneratedImage(args.out, ctx.directory, base64)

          return {
            output: message,
            metadata: {
              out: savedPath,
              versioned,
              billing: "subscription",
            },
          }
        },
      }),
    },
  }
}

export default {
  id: "opencode-gpt-imagegen",
  server: GptImagePlugin,
} satisfies PluginModule
