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
})
