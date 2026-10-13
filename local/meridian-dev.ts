// Fork-local entry that loads the plugin with its requests sent to the local Meridian (meridian-dev),
// which holds the ChatGPT seats. A plain file path is used because Vibeterm's per-process config
// override can add a plugin path but not a `[path, options]` tuple.
import type { PluginInput, PluginModule } from "@opencode-ai/plugin"
import plugin from "../src/index"

export default {
  id: "opencode-gpt-imagegen-meridian-dev",
  server: (input: PluginInput) => plugin.server(input, { baseURL: "http://127.0.0.1:3457/v1" }),
} satisfies PluginModule
