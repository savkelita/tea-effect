import { describe, it, expect } from 'vitest'
import { Effect, Stream, Chunk, pipe } from 'effect'
import * as Task from '../src/Task'

describe('Task', () => {
  describe('succeed', () => {
    it('should create successful task', async () => {
      const task = Task.succeed(42)
      const result = await Effect.runPromise(task)
      expect(result).toBe(42)
    })
  })

  describe('fail', () => {
    it('should create failed task', async () => {
      const task = Task.fail('error')
      const result = await Effect.runPromiseExit(task)
      expect(result._tag).toBe('Failure')
    })
  })

  describe('perform', () => {
    it('should convert infallible task to cmd', async () => {
      const task = Task.succeed(42)
      const cmd = Task.perform((n) => ({ type: 'GotNumber', n }))(task)
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)
      expect(messages).toEqual([{ type: 'GotNumber', n: 42 }])
    })
  })

  describe('attempt', () => {
    it('should handle success', async () => {
      const task = Task.succeed('ok')
      const cmd = Task.attempt((either) =>
        either._tag === 'Right'
          ? { type: 'Success', value: either.right }
          : { type: 'Failure', error: either.left }
      )(task)
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)
      expect(messages).toEqual([{ type: 'Success', value: 'ok' }])
    })

    it('should handle failure', async () => {
      const task = Task.fail('error')
      const cmd = Task.attempt((either) =>
        either._tag === 'Right'
          ? { type: 'Success', value: either.right }
          : { type: 'Failure', error: either.left }
      )(task)
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)
      expect(messages).toEqual([{ type: 'Failure', error: 'error' }])
    })
  })

  describe('attemptWith', () => {
    type Msg = { type: 'Success'; n: number } | { type: 'Failure'; e: string }

    it('should handle success with separate handlers', async () => {
      const task: Task.Task<number, string> = Task.succeed(42)
      const cmd = pipe(
        task,
        Task.attemptWith<number, string, Msg, never>({
          onSuccess: (n): Msg => ({ type: 'Success', n }),
          onFailure: (e): Msg => ({ type: 'Failure', e })
        })
      )
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)
      expect(messages).toEqual([{ type: 'Success', n: 42 }])
    })

    it('should handle failure with separate handlers', async () => {
      const task: Task.Task<number, string> = Task.fail('oops')
      const cmd = pipe(
        task,
        Task.attemptWith<number, string, Msg, never>({
          onSuccess: (n): Msg => ({ type: 'Success', n }),
          onFailure: (e): Msg => ({ type: 'Failure', e })
        })
      )
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)
      expect(messages).toEqual([{ type: 'Failure', e: 'oops' }])
    })
  })

  describe('map', () => {
    it('should transform success value', async () => {
      const task = Task.succeed(2)
      const mapped = Task.map((n: number) => n * 3)(task)
      const result = await Effect.runPromise(mapped)
      expect(result).toBe(6)
    })
  })

  describe('mapError', () => {
    it('should transform error value', async () => {
      const task = Task.fail('error')
      const mapped = Task.mapError((e: string) => e.toUpperCase())(task)
      const result = await Effect.runPromiseExit(mapped)
      expect(result._tag).toBe('Failure')
    })
  })

  describe('flatMap', () => {
    it('should chain tasks', async () => {
      const task = Task.succeed(2)
      const chained = Task.flatMap((n: number) => Task.succeed(n * 3))(task)
      const result = await Effect.runPromise(chained)
      expect(result).toBe(6)
    })
  })

  describe('both', () => {
    it('should run tasks concurrently', async () => {
      const taskA = Task.succeed('a')
      const taskB = Task.succeed('b')
      const combined = Task.both(taskA, taskB)
      const result = await Effect.runPromise(combined)
      expect(result).toEqual(['a', 'b'])
    })
  })

  describe('all', () => {
    it('should run all tasks concurrently', async () => {
      const tasks = [Task.succeed(1), Task.succeed(2), Task.succeed(3)]
      const result = await Effect.runPromise(Task.all(tasks))
      expect(result).toEqual([1, 2, 3])
    })
  })
})
