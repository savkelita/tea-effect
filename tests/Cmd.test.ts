import { describe, it, expect } from 'vitest'
import { Effect, Stream } from 'effect'
import * as Cmd from '../src/Cmd'

describe('Cmd', () => {
  describe('none', () => {
    it('should produce no message', async () => {
      const result = await Effect.runPromise(Stream.runCollect(Cmd.none))
      expect(result).toEqual([])
    })
  })

  describe('of', () => {
    it('should produce the given message', async () => {
      const msg = { type: 'Test' }
      const result = await Effect.runPromise(Stream.runCollect(Cmd.of(msg)))
      expect(result).toEqual([msg])
    })
  })

  describe('map', () => {
    it('should transform the message', async () => {
      const cmd = Cmd.of({ value: 1 })
      const mapped = Cmd.map((msg: { value: number }) => ({ doubled: msg.value * 2 }))(cmd)
      const result = await Effect.runPromise(Stream.runCollect(mapped))
      expect(result).toEqual([{ doubled: 2 }])
    })

    it('should not transform none', async () => {
      const mapped = Cmd.map((msg: string) => msg.toUpperCase())(Cmd.none)
      const result = await Effect.runPromise(Stream.runCollect(mapped))
      expect(result).toEqual([])
    })

    // A parent wiring a child's commands must keep "this branch does nothing" visible.
    it('should give back none itself', () => {
      expect(Cmd.map((msg: string) => msg.toUpperCase())(Cmd.none)).toBe(Cmd.none)
      expect(Cmd.batch([Cmd.map((msg: string) => msg)(Cmd.none), Cmd.none])).toBe(Cmd.none)
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
      const messages = result

      // Both messages should be produced (order may vary due to concurrency)
      expect(messages).toHaveLength(2)
      expect(messages).toContain('first')
      expect(messages).toContain('second')
    })

    it('should fail as a whole and interrupt the other commands when one fails', async () => {
      let finalized = false
      const pending = Cmd.fromEffect(Effect.ensuring(Effect.never, Effect.sync(() => { finalized = true })))
      const failing = Cmd.fromEffect(Effect.fail('boom'))

      const error = await Effect.runPromise(Effect.flip(Stream.runDrain(Cmd.batch([pending, failing]))))

      expect(error).toBe('boom')
      expect(finalized).toBe(true)
    })
  })

  describe('fromEffect', () => {
    it('should create cmd from effect', async () => {
      const effect = Effect.succeed('hello')
      const cmd = Cmd.fromEffect(effect)
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      expect(result).toEqual(['hello'])
    })
  })

  // What the runtime does with the key is tested in Platform.test.ts.
  describe('latest', () => {
    // Without a key the runtime runs a command as one stream, as it always did.
    it('should leave commands without a key as they are', () => {
      expect(Cmd.getCmdEntries(Cmd.of('a'))).toBeUndefined()
      expect(Cmd.getCmdEntries(Cmd.batch([Cmd.of('a'), Cmd.of('b')]))).toBeUndefined()
      expect(Cmd.getCmdEntries(Cmd.map((s: string) => s.length)(Cmd.of('a')))).toBeUndefined()
    })

    it('should put the command under the key', () => {
      const cmd = Cmd.of('a')
      const entries = Cmd.getCmdEntries(Cmd.latest('users/list')(cmd))
      expect(entries).toHaveLength(1)
      expect(entries?.[0].key).toBe('users/list')
      expect(entries?.[0].stream).toBe(cmd)
    })

    // Outside a program nothing replaces it.
    it('should deliver every message when run as a stream', async () => {
      const result = await Effect.runPromise(Stream.runCollect(Cmd.latest('k')(Stream.make('a', 'b'))))
      expect(result).toEqual(['a', 'b'])
    })

    // Nothing under a key still replaces what runs under it, so it must not vanish like none.
    it('should not give back none for none', () => {
      const stop = Cmd.latest('k')(Cmd.none)
      expect(stop).not.toBe(Cmd.none)
      expect(Cmd.batch([stop, Cmd.none])).toBe(stop)
      expect(Cmd.getCmdEntries(stop)?.map((entry) => entry.key)).toEqual(['k'])
    })

    it('should keep the key through map', async () => {
      const entries = Cmd.getCmdEntries(Cmd.map((s: string) => s.length)(Cmd.latest('k')(Cmd.of('abc'))))
      expect(entries?.map((entry) => entry.key)).toEqual(['k'])
      const result = await Effect.runPromise(Stream.runCollect(entries![0].stream))
      expect(result).toEqual([3])
    })

    it('should keep the keys of the parts of a batch, in order', () => {
      const batched = Cmd.batch([Cmd.latest('a')(Cmd.of(1)), Cmd.of(2), Cmd.latest('b')(Cmd.of(3))])
      expect(Cmd.getCmdEntries(batched)?.map((entry) => entry.key)).toEqual(['a', undefined, 'b'])
    })

    it('should put a command that already has keys under the new key as a whole', () => {
      const inner = Cmd.batch([Cmd.latest('a')(Cmd.of(1)), Cmd.of(2)])
      const entries = Cmd.getCmdEntries(Cmd.latest('outer')(inner))
      expect(entries?.map((entry) => entry.key)).toEqual(['outer'])
      expect(entries?.[0].stream).toBe(inner)
    })
  })
})
