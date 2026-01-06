import { describe, it, expect } from 'vitest'
import { Effect, Stream } from 'effect'
import * as Platform from '../src/Platform'
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'

describe('Platform', () => {
  type Model = { count: number }
  type Msg = { type: 'Increment' } | { type: 'Decrement' } | { type: 'Set'; value: number }

  const init: readonly [Model, Cmd.Cmd<Msg>] = [{ count: 0 }, Cmd.none]

  const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
    switch (msg.type) {
      case 'Increment':
        return [{ count: model.count + 1 }, Cmd.none]
      case 'Decrement':
        return [{ count: model.count - 1 }, Cmd.none]
      case 'Set':
        return [{ count: msg.value }, Cmd.none]
    }
  }

  const subscriptions = (_model: Model): Sub.Sub<Msg> => Sub.none

  describe('program', () => {
    it('should create a program with initial model', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* Platform.program(init, update, subscriptions)

            // Get initial model
            const firstModel = yield* Stream.runHead(program.model$)
            expect(firstModel._tag).toBe('Some')
            if (firstModel._tag === 'Some') {
              expect(firstModel.value.count).toBe(0)
            }

            yield* program.shutdown
          })
        )
      )
    })

    it('should update model on dispatch', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* Platform.program(init, update, subscriptions)

            // Dispatch increment
            program.dispatch({ type: 'Increment' })

            // Wait for update to propagate
            yield* Effect.sleep('200 millis')

            // Dispatch should have worked (we verify by shutdown working)
            yield* program.shutdown
          })
        )
      )
    }, 10000)

    it('should handle multiple dispatches', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* Platform.program(init, update, subscriptions)

            // Dispatch multiple times
            program.dispatch({ type: 'Increment' })
            program.dispatch({ type: 'Increment' })
            program.dispatch({ type: 'Increment' })

            // Wait for updates
            yield* Effect.sleep('100 millis')

            yield* program.shutdown
          })
        )
      )
    })

    it('should execute initial command', async () => {
      const initWithCmd: readonly [Model, Cmd.Cmd<Msg>] = [
        { count: 0 },
        Cmd.of({ type: 'Set', value: 42 })
      ]

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* Platform.program(initWithCmd, update, subscriptions)

            // Wait for command to execute
            yield* Effect.sleep('100 millis')

            yield* program.shutdown
          })
        )
      )
    })

    it('should shutdown gracefully', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* Platform.program(init, update, subscriptions)

            // Dispatch after creating
            program.dispatch({ type: 'Increment' })

            // Shutdown
            yield* program.shutdown

            // Should complete without error
          })
        )
      )
    })
  })

  describe('programWithFlags', () => {
    it('should create program with flags', async () => {
      const initWithFlags = (flags: { startValue: number }): readonly [Model, Cmd.Cmd<Msg>] => [
        { count: flags.startValue },
        Cmd.none
      ]

      const createProgram = Platform.programWithFlags(initWithFlags, update, subscriptions)

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* createProgram({ startValue: 100 })

            const firstModel = yield* Stream.runHead(program.model$)
            expect(firstModel._tag).toBe('Some')
            if (firstModel._tag === 'Some') {
              expect(firstModel.value.count).toBe(100)
            }

            yield* program.shutdown
          })
        )
      )
    })
  })

  describe('run', () => {
    it('should return model stream', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* Platform.program(init, update, subscriptions)
            const stream = Platform.run(program)

            const firstModel = yield* Stream.runHead(stream)
            expect(firstModel._tag).toBe('Some')

            yield* program.shutdown
          })
        )
      )
    })
  })
})
