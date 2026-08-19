/** Desktop Host services: profiles, managed pnpm, direct-bundle inventory, and native actions. */

import type { Context } from '@deepseek-ai/cordis'
import { DesktopActionsService } from './desktop-actions.ts'
import { controlActionsBootstrap } from './control-actions.ts'
import { DesktopPluginsService } from './desktop-plugins.ts'
import { DesktopPnpm, type DesktopPnpmBootstrap } from './pnpm.ts'
import { DesktopProfileService } from './profile-service.ts'
import { listDesktopProfiles, selectDesktopProfile } from './profile-manager.ts'
import { DESKTOP_BOOTSTRAP_ENV, readDesktopBootstrap } from './bootstrap.ts'

export { assertDesktopProfileName, listDesktopProfiles, selectDesktopProfile } from './profile-manager.ts'
export { DESKTOP_INSTALL_RECOVERY_STATE_ENV, desktopInstallRecoveryStatePath } from './install-recovery.ts'
export { DesktopActionsService } from './desktop-actions.ts'
export { DesktopPluginsService } from './desktop-plugins.ts'
export { DesktopProfileService } from './profile-service.ts'
export { DesktopPnpm } from './pnpm.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-host'

/** Subprocess capability drives the managed package-manager operations. */
export const inject = ['subprocess']

/**
 * Register every desktop service for this generation.
 *
 * Without `DSH_DESKTOP_BOOTSTRAP` — an ordinary `dsh web` boot — the plugin
 * stays inert and the community market degrades to read-only browsing. With a
 * bootstrap file published by the Electron launcher, the profile,
 * package-manager, bundle-inventory, and native-action services go live for
 * that generation.
 * @param ctx - Host context carrying the subprocess capability.
 */
export async function apply(ctx: Context): Promise<void> {
  const bootstrapPath = process.env[DESKTOP_BOOTSTRAP_ENV]
  if (bootstrapPath === undefined || bootstrapPath === '') return
  const boot = readDesktopBootstrap(bootstrapPath)
  const pnpmBootstrap: DesktopPnpmBootstrap = {
    activeProfileName: boot.profile.name,
    activeProfileDir: boot.profile.dir,
    homeDir: boot.profile.homeDir,
    generationId: boot.generationId,
    ...boot.pnpm,
  }
  ctx.provide('desktopPnpmBootstrap', pnpmBootstrap)
  await ctx.plugin(DesktopActionsService, controlActionsBootstrap(boot.actions))
  await ctx.plugin(DesktopProfileService, {
    current: { name: boot.profile.name, dir: boot.profile.dir },
    list: () => listDesktopProfiles(boot.profile.homeDir),
    persistSelection: (target: string) => { selectDesktopProfile(boot.profile.statePath, boot.profile.homeDir, target) },
    requestRestart: () => controlActionsBootstrap(boot.actions).requestRestart(),
  })
  await ctx.plugin(DesktopPluginsService, {
    profileName: boot.profile.name,
    homeDir: boot.profile.homeDir,
    statePath: boot.plugins.statePath,
    installAnchor: boot.plugins.installAnchor,
  })
  await ctx.plugin(DesktopPnpm, pnpmBootstrap)
}
