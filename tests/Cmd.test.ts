import { describe, it, expect } from 'vitest'
import { Effect, Stream, Chunk } from 'effect'
import * as Cmd from '../src/Cmd'

describe('Cmd', () => {
  describe('none', () => {
    it('should produce no message', async () => {
      const result = await Effect.runPromise(Stream.runCollect(Cmd.none))
      expect(Chunk.toArray(result)).toEqual([])
    })
  })

  describe('of', () => {
    it('should produce the given message', async () => {
      const msg = { type: 'Test' }
      const result = await Effect.runPromise(Stream.runCollect(Cmd.of(msg)))
      expect(Chunk.toArray(result)).toEqual([msg])
    })
  })

  describe('map', () => {
    it('should transform the message', async () => {
      const cmd = Cmd.of({ value: 1 })
      const mapped = Cmd.map((msg: { value: number }) => ({ doubled: msg.value * 2 }))(cmd)
      const result = await Effect.runPromise(Stream.runCollect(mapped))
      expect(Chunk.toArray(result)).toEqual([{ doubled: 2 }])
    })

    it('should not transform none', async () => {
      const mapped = Cmd.map((msg: string) => msg.toUpperCase())(Cmd.none)
      const result = await Effect.runPromise(Stream.runCollect(mapped))
      expect(Chunk.toArray(result)).toEqual([])
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

      const result = await Effect.runPromise(Stream.runCollect(batched))
      const messages = Chunk.toArray(result)

      // Both messages should be produced (order may vary due to concurrency)
      expect(messages).toHaveLength(2)
      expect(messages).toContain('first')
      expect(messages).toContain('second')
    })
  })

  describe('fromEffect', () => {
    it('should create cmd from effect', async () => {
      const effect = Effect.succeed('hello')
      const cmd = Cmd.fromEffect(effect)
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      expect(Chunk.toArray(result)).toEqual(['hello'])
    })
  })
})
