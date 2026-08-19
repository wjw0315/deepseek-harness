/** `settings.desktopHost` namespace dictionaries (the Desktop Web Host row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '桌面应用 Web Host',
  'description': '配置桌面应用启动 Web Host 的绑定地址、固定端口与信任域名（改后重启应用生效）',
  'webHost': '绑定地址',
  'webPort': '端口（0 = 自动）',
  'trustedHosts': '信任域名（逗号分隔）',
  'restartHint': '保存后需重启应用生效',
  'unavailable': '不可用',
  'save': '保存',
  'cancel': '取消',
  'restartApp': '重新启动',
} satisfies Record<string, string>

/** The `settings.desktopHost` namespace key union. */
export type DesktopHostKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Desktop Web Host',
  'description': 'Configure the bind host, fixed port, and trusted domains the desktop app uses to launch the Web Host (restart the app to apply)',
  'webHost': 'Bind host',
  'webPort': 'Port (0 = auto)',
  'trustedHosts': 'Trusted domains (comma-separated)',
  'restartHint': 'Restart the app to apply',
  'unavailable': 'Unavailable',
  'save': 'Save',
  'cancel': 'Cancel',
  'restartApp': 'Restart',
} satisfies Record<string, string>
