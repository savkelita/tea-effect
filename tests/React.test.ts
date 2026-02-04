import { describe, it, expect } from 'vitest'
import { Effect, Stream } from 'effect'
import * as TeaReact from '../src/React'
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'

describe('React', () => {
  type Model = { count: number }
  type Msg = { type: 'Increment' }

  const init: readonly [Model, Cmd.Cmd<Msg>] = [{ count: 0 }, Cmd.none]

  const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
    switch (msg.type) {
      case 'Increment':
        return [{ count: model.count + 1 }, Cmd.none]
    }
  }

  const view = (model: Model): TeaReact.Html<Msg> => (_dispatch) => {
    // In tests, we just return null since we don't need actual React elements
    // The important thing is that the view function is called with the model
    void model.count // use model to avoid unused warning
    return null
  }

  const subscriptions = (_model: Model): Sub.Sub<Msg> => Sub.none

  describe('program', () => {
    it('should create a React program', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* TeaReact.program(init, update, view, subscriptions)

            expect(program.dispatch).toBeDefined()
            expect(program.model$).toBeDefined()
            expect(program.html$).toBeDefined()
            expect(program.shutdown).toBeDefined()

            yield* program.shutdown
          })
        )
      )
    })

    it('should produce html stream', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* TeaReact.program(init, update, view, subscriptions)

            // Get first rendered element
            const firstHtml = yield* Stream.runHead(program.html$)
            expect(firstHtml._tag).toBe('Some')

            yield* program.shutdown
          })
        )
      )
    })
  })

  describe('programWithFlags', () => {
    it('should create program with flags', async () => {
      const initWithFlags = (flags: { start: number }): readonly [Model, Cmd.Cmd<Msg>] => [
        { count: flags.start },
        Cmd.none
      ]

      const createProgram = TeaReact.programWithFlags(initWithFlags, update, view, subscriptions)

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const program = yield* createProgram({ start: 10 })

            const firstModel = yield* Stream.runHead(program.model$)
            expect(firstModel._tag).toBe('Some')
            if (firstModel._tag === 'Some') {
              expect(firstModel.value.count).toBe(10)
            }

            yield* program.shutdown
          })
        )
      )
    })
  })

  describe('Dom type', () => {
    it('should allow null as ReactElement', () => {
      const element: TeaReact.Dom = null
      expect(element).toBeNull()
    })
  })

  describe('Html type', () => {
    it('should be a function that takes dispatch', () => {
      const html: TeaReact.Html<Msg> = (dispatch) => {
        dispatch({ type: 'Increment' })
        return null
      }
      expect(typeof html).toBe('function')
    })
  })
})
