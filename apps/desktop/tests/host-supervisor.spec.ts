import { describe, expect, it } from 'vitest'
import { createReadinessParser } from '../src/host-supervisor.ts'

const line = 'dsh web: http://127.0.0.1:51876/\n'

describe('createReadinessParser', () => {
  it('extracts the readiness URL across chunk boundaries', () => {
    const parser = createReadinessParser()
    expect(parser.push(line.slice(0, 10))).toBeUndefined()
    expect(parser.push(line.slice(10))).toBe('http://127.0.0.1:51876')
  })

  it('rejects a non-loopback address', () => {
    const parser = createReadinessParser()
    expect(() => {
      parser.push('dsh web: http://0.0.0.0:51876/\n')
      parser.finalize()
    }).toThrow()
  })

  it('finalize() requires a readiness line', () => {
    expect(() => createReadinessParser().finalize()).toThrow()
  })
})
