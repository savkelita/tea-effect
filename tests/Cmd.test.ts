import { describe, it, expect } from 'vitest'
import { Effect, Option } from 'effect'
import * as Cmd from '../src/Cmd'

describe('Cmd', () => {
  describe('none', () => {
    it('should produce no message', async () => {
      const result = await Effect.runPromise(Cmd.none)
      expect(result).toEqual(Option.none())
    })
  })

  describe('of', () => {
    it('should produce the given message', async () => {
      const msg = { type: 'Test' }
      const result = await Effect.runPromise(Cmd.of(msg))
      expect(result).toEqual(Option.some(msg))
    })
  })

  describe('map', () => {
    it('should transform the message', async () => {
      const cmd = Cmd.of({ value: 1 })
      const mapped = Cmd.map((msg: { value: number }) => ({ doubled: msg.value * 2 }))(cmd)
      const result = await Effect.runPromise(mapped)
      expect(result).toEqual(Option.some({ doubled: 2 }))
    })

    it('should not transform none', async () => {
      const mapped = Cmd.map((msg: string) => msg.toUpperCase())(Cmd.none)
      const result = await Effect.runPromise(mapped)
      expect(result).toEqual(Option.none())
    })
  })

  describe('batch', () => {
    it('should return none for empty array', () => {
      const batched = Cmd.batch([])
      expect(batched).toBe(Cmd.none)
    })

    it('should return single cmd unchanged', () => {
      const cmd = Cmd.of('test')
      const batched = Cmd.batch([cmd])
      expect(batched).toBe(cmd)
    })

    it('should merge multiple commands', async () => {
      const cmd1 = Cmd.of('first')
      const cmd2 = Cmd.of('second')
      const batched = Cmd.batch([cmd1, cmd2])

      // Batch runs commands and collects results
      const result = await Effect.runPromise(batched)
      // One of the messages should be produced
      expect(Option.isSome(result)).toBe(true)
    })
  })

  describe('batchAll', () => {
    it('should collect all messages', async () => {
      const cmd1 = Cmd.of('a')
      const cmd2 = Cmd.of('b')
      const cmd3 = Cmd.none as Cmd.Cmd<string>
      const result = await Effect.runPromise(Cmd.batchAll([cmd1, cmd2, cmd3]))
      expect(result).toEqual(['a', 'b'])
    })
  })
})
