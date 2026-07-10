import { describe, it, expect } from 'vitest'
import { Effect, Stream } from 'effect'
import * as Sub from '../src/Sub'

describe('Sub', () => {
  describe('none', () => {
    it('should produce no messages', async () => {
      const messages = await Effect.runPromise(Stream.runCollect(Sub.none))
      expect(Array.from(messages)).toEqual([])
    })
  })

  describe('of', () => {
    it('should produce single message', async () => {
      const sub = Sub.of('test')
      const messages = await Effect.runPromise(Stream.runCollect(sub))
      expect(Array.from(messages)).toEqual(['test'])
    })
  })

  describe('fromIterable', () => {
    it('should produce messages from iterable', async () => {
      const sub = Sub.fromIterable([1, 2, 3])
      const messages = await Effect.runPromise(Stream.runCollect(sub))
      expect(Array.from(messages)).toEqual([1, 2, 3])
    })
  })

  describe('map', () => {
    it('should transform messages', async () => {
      const sub = Sub.fromIterable([1, 2, 3])
      const mapped = Sub.map((n: number) => n * 2)(sub)
      const messages = await Effect.runPromise(Stream.runCollect(mapped))
      expect(Array.from(messages)).toEqual([2, 4, 6])
    })
  })

  describe('batch', () => {
    it('should return none for empty array', () => {
      const batched = Sub.batch([])
      expect(batched).toBe(Sub.none)
    })

    it('should return single sub unchanged', () => {
      const sub = Sub.of('test')
      const batched = Sub.batch([sub])
      expect(batched).toBe(sub)
    })

    it('should merge multiple subscriptions', async () => {
      const sub1 = Sub.of('a')
      const sub2 = Sub.of('b')
      const batched = Sub.batch([sub1, sub2])
      const messages = await Effect.runPromise(Stream.runCollect(batched))
      const arr = Array.from(messages)
      expect(arr).toContain('a')
      expect(arr).toContain('b')
    })
  })

  describe('filter', () => {
    it('should filter messages', async () => {
      const sub = Sub.fromIterable([1, 2, 3, 4, 5])
      const filtered = Sub.filter((n: number) => n % 2 === 0)(sub)
      const messages = await Effect.runPromise(Stream.runCollect(filtered))
      expect(Array.from(messages)).toEqual([2, 4])
    })
  })

  describe('fromCallback', () => {
    it('should create subscription from callback', async () => {
      const sub = Sub.fromCallback<string>((emit) => {
        emit('hello')
        emit('world')
        return () => {} // cleanup
      })

      // Take first 2 messages
      const messages = await Effect.runPromise(
        Stream.runCollect(Stream.take(sub, 2))
      )
      expect(Array.from(messages)).toEqual(['hello', 'world'])
    })
  })

  // Regression tests for audited bugs (see AUDIT.md).
  describe('AUDIT regressions', () => {
    const keys = <M>(sub: Sub.Sub<M>) => Sub.getSubEntries(sub).map((e) => e.key)

    it('#1: interval has a stable key derived from its args', () => {
      expect(keys(Sub.interval(300, { type: 'Tick' }))).toEqual(keys(Sub.interval(300, { type: 'Tick' })))
      expect(keys(Sub.interval(300, { type: 'Tick' }))[0]).not.toBe(keys(Sub.interval(500, { type: 'Tick' }))[0])
    })

    it('#1: of has a stable key derived from the message', () => {
      expect(keys(Sub.of('a'))).toEqual(keys(Sub.of('a')))
      expect(keys(Sub.of('a'))[0]).not.toBe(keys(Sub.of('b'))[0])
    })

    it('#1: batch flattens child entries', () => {
      const sub = Sub.batch([Sub.interval(100, { type: 'A' }), Sub.interval(200, { type: 'B' })])
      expect(Sub.getSubEntries(sub)).toHaveLength(2)
    })

    it('#1: map/filter keep one entry per source and suffix the key', () => {
      const base = Sub.interval(100, 1)
      const mapped = Sub.map((n: number) => n + 1)(base)
      expect(Sub.getSubEntries(mapped)).toHaveLength(1)
      expect(Sub.getSubEntries(mapped)[0].key.endsWith(':map')).toBe(true)

      const filtered = Sub.filter((n: number) => n > 0)(base)
      expect(Sub.getSubEntries(filtered)[0].key.endsWith(':filter')).toBe(true)
    })

    it('#1: none has no entries', () => {
      expect(Sub.getSubEntries(Sub.none)).toHaveLength(0)
    })
  })
})
