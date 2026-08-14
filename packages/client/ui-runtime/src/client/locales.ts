/** `settings.runtime` namespace dictionaries (the runtime port row copy). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.runtime'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'runtime.portLabel': '运行时端口',
  'runtime.portHint': '本地 dsh 服务监听端口（3080，或回退的动态端口）',
} satisfies Record<string, string>

/** The settings.runtime namespace key union. */
export type RuntimeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'runtime.portLabel': 'Runtime port',
  'runtime.portHint': 'Local dsh service listen port (3080, or a dynamic fallback)',
} satisfies Record<RuntimeKey, string>
