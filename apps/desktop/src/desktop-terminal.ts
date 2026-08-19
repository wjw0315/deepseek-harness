/**
 * macOS DSH terminal surface: command shims plus the welcome script
 * LaunchServices opens in Terminal.app (darwin port of upstream desktop-terminal).
 */

import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXECUTABLE_FILE_MODE = 0o700

/** Launcher values for one generated terminal generation. */
export interface DesktopTerminalOptions {
  /** Electron executable that enters Node mode under ELECTRON_RUN_AS_NODE. */
  readonly appExecutable: string
  /** Packaged pnpm entry the pnpm shim execs. */
  readonly pnpmBinPath: string
  /** DSH CLI bootstrap entry the dsh shim execs. */
  readonly dshBootstrapPath: string
  /** Profile whose directory and name the terminal operates on. */
  readonly profileName: string
  /** Version shown in the welcome banner. */
  readonly productVersion: string
  /** Absolute directory the welcome shell starts in. */
  readonly profileDir: string
  /** Harness home published to the shell. */
  readonly homeDir: string
  /** Install-recovery WAL path scoped to terminal-launched CLI runs. */
  readonly installRecoveryStatePath: string
  /** Private directory receiving shims and shell startup files. */
  readonly stateDir: string
  /** Optional sink for terminal launch failures. */
  readonly onLaunchError?: (cause: Error) => void
}

/** Quote one arbitrary value as a POSIX shell word. */
function quoteSh(value: string): string {
  const q = String.fromCharCode(39)
  const escaped = String.fromCharCode(39, 34, 39, 34, 39)
  return q + value.split(q).join(escaped) + q
}

function replacePrivateExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o600 })
  chmodSync(path, EXECUTABLE_FILE_MODE)
}

function prepareStateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 })
}

function macShim(appExecutable: string, binPath: string | undefined): string {
  const entry = binPath === undefined ? '' : ' ' + quoteSh(binPath)
  return [
    '#!/bin/sh',
    'ELECTRON_RUN_AS_NODE=1 exec ' + quoteSh(appExecutable) + entry + ' "$@"',
    '',
  ].join('\n')
}

function macDshShim(options: DesktopTerminalOptions): string {
  return [
    '#!/bin/sh',
    [
      'DSH_DESKTOP_DEFAULT_PROFILE=' + quoteSh(options.profileName),
      'ELECTRON_RUN_AS_NODE=1',
      'exec ' + quoteSh(options.appExecutable) + ' --expose-internals ' + quoteSh(options.dshBootstrapPath) + ' "$@"',
    ].join(' '),
    '',
  ].join('\n')
}

function macPnpmShim(options: DesktopTerminalOptions): string {
  return [
    '#!/bin/sh',
    [
      'ELECTRON_RUN_AS_NODE=1',
      'exec ' + quoteSh(options.appExecutable) + ' ' + quoteSh(options.pnpmBinPath) + ' "$@"',
    ].join(' '),
    '',
  ].join('\n')
}

function macZshRc(options: DesktopTerminalOptions, shimDir: string): string {
  return [
    'if [[ -n "${DSH_DESKTOP_USER_ZDOTDIR:-}" && -r "${DSH_DESKTOP_USER_ZDOTDIR}/.zshrc" ]]; then',
    '  ZDOTDIR="${DSH_DESKTOP_USER_ZDOTDIR}"',
    '  source "${DSH_DESKTOP_USER_ZDOTDIR}/.zshrc"',
    'fi',
    'unset ELECTRON_RUN_AS_NODE',
    'export DSH_HOME=' + quoteSh(options.homeDir),
    'export DSH_DESKTOP_INSTALL_RECOVERY_STATE_PATH=' + quoteSh(options.installRecoveryStatePath),
    'typeset -U path',
    'path=(' + quoteSh(shimDir) + ' $path)',
    'export PATH',
    'unset DSH_DESKTOP_USER_ZDOTDIR',
    '',
  ].join('\n')
}

function macBashRc(options: DesktopTerminalOptions, shimDir: string): string {
  return [
    'if [ -n "${DSH_DESKTOP_USER_BASHRC:-}" ] && [ -r "${DSH_DESKTOP_USER_BASHRC}" ]; then',
    '  . "${DSH_DESKTOP_USER_BASHRC}"',
    'fi',
    'unset ELECTRON_RUN_AS_NODE',
    'export DSH_HOME=' + quoteSh(options.homeDir),
    'export DSH_DESKTOP_INSTALL_RECOVERY_STATE_PATH=' + quoteSh(options.installRecoveryStatePath),
    'case ":${PATH:-}:" in',
    '  *:' + quoteSh(shimDir) + ':*) ;;',
    '  *) export PATH=' + quoteSh(shimDir) + ':"${PATH:-}" ;;',
    'esac',
    'unset DSH_DESKTOP_USER_BASHRC',
    '',
  ].join('\n')
}

function macWelcome(options: DesktopTerminalOptions, shimDir: string, bashRcPath: string): string {
  return [
    '#!/bin/sh',
    'unset ELECTRON_RUN_AS_NODE',
    'export DSH_HOME=' + quoteSh(options.homeDir),
    'export DSH_DESKTOP_INSTALL_RECOVERY_STATE_PATH=' + quoteSh(options.installRecoveryStatePath),
    'export PATH=' + quoteSh(shimDir) + ':"${PATH:-}"',
    'cd ' + quoteSh(options.profileDir),
    'printf \'\\033[2J\\033[3J\\033[H\'',
    "printf '%s\\n' " + quoteSh('DS-harness ' + options.productVersion + ' terminal'),
    "printf '%s\\n' " + quoteSh('Profile: ' + options.profileName),
    "printf '%s\\n' " + quoteSh('Harness home: ' + options.homeDir),
    "printf '%s\\n' " + quoteSh('Plugin commands without --profile modify the ' + options.profileName + ' profile.'),
    "printf '%s\\n' " + quoteSh('Restart DS-harness after plugin changes.'),
    'case "${SHELL:-/bin/zsh}" in',
    '  */bash)',
    '    export DSH_DESKTOP_USER_BASHRC="${HOME:-}/.bashrc"',
    '    exec "${SHELL}" --noprofile --rcfile ' + quoteSh(bashRcPath) + ' -i',
    '    ;;',
    '  *)',
    '    export DSH_DESKTOP_USER_ZDOTDIR="${HOME:-}"',
    '    ZDOTDIR=' + quoteSh(options.stateDir) + ' exec "${SHELL:-/bin/zsh}" -i',
    '    ;;',
    'esac',
    '',
  ].join('\n')
}

function prepareTerminalFiles(options: DesktopTerminalOptions): { shimDir: string; welcomePath: string } {
  prepareStateDirectory(options.stateDir)
  const shimDir = join(options.stateDir, 'bin')
  prepareStateDirectory(shimDir)
  const welcomePath = join(options.stateDir, 'welcome.command')
  replacePrivateExecutable(join(shimDir, 'dsh'), macDshShim(options))
  replacePrivateExecutable(join(shimDir, 'pnpm'), macPnpmShim(options))
  replacePrivateExecutable(join(shimDir, 'node'), macShim(options.appExecutable, undefined))
  writeFileSync(join(options.stateDir, '.zshrc'), macZshRc(options, shimDir), { mode: 0o600 })
  const bashRcPath = join(options.stateDir, 'bashrc')
  writeFileSync(bashRcPath, macBashRc(options, shimDir), { mode: 0o600 })
  replacePrivateExecutable(welcomePath, macWelcome(options, shimDir, bashRcPath))
  return { shimDir, welcomePath }
}

/**
 * Open the macOS DSH terminal: regenerate shims and the welcome script, then
 * hand it to Terminal.app. Non-darwin platforms report a launch error instead.
 * @param options - launcher values and the private terminal state directory.
 */
export function openDesktopTerminalWindow(options: DesktopTerminalOptions): void {
  if (process.platform !== 'darwin') {
    options.onLaunchError?.(new Error('dsh-desktop: terminal is unsupported on ' + process.platform))
    return
  }
  const files = prepareTerminalFiles(options)
  const child = spawn('/usr/bin/open', ['-a', 'Terminal', files.welcomePath], {
    cwd: options.profileDir,
    detached: true,
    stdio: 'ignore',
    shell: false,
  })
  child.once('error', (cause) => { options.onLaunchError?.(cause) })
  child.unref()
}
