import { Effect } from 'effect'
import { describe, it, expect } from 'vitest'
import * as Cmd from '../src/Cmd'
import * as Html from '../src/Html'
import * as Platform from '../src/Platform'

type Msg = { readonly text: string }

const program = (start: string) =>
  Html.program<string, Msg, string>(
    [start, Cmd.none],
    (msg, _model) => [msg.text, Cmd.none],
    model => () => model,
  )

describe('synchronous dispatch', () => {
  // A renderer driving controlled DOM inputs must see the new model before the event
  // that dispatched it returns; otherwise the reconciler writes the stale value back
  // over what the user just typed, which also clears the field's native undo history.
  it('should render inside dispatch, before it returns', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* program('first')
          const seen: Array<string> = []
          const stop = prog.subscribeHtml(dom => void seen.push(dom))

          expect(seen).toEqual(['first'])

          prog.dispatch({ text: 'second' })
          expect(seen).toEqual(['first', 'second'])

          prog.dispatch({ text: 'third' })
          expect(seen).toEqual(['first', 'second', 'third'])

          stop()
        }),
      ),
    ))

  it('should stop delivering after the subscription is dropped', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* program('first')
          const seen: Array<string> = []
          prog.subscribeHtml(dom => void seen.push(dom))()

          prog.dispatch({ text: 'second' })

          expect(seen).toEqual(['first'])
        }),
      ),
    ))

  it('should hand the current model to a late subscriber', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* Platform.program<string, Msg>([
            'first',
            Cmd.none,
          ], (msg, _model) => [msg.text, Cmd.none])

          prog.dispatch({ text: 'second' })

          const seen: Array<string> = []
          prog.subscribe(model => void seen.push(model))

          expect(seen).toEqual(['second'])
        }),
      ),
    ))

  it('should keep dispatching after shutdown a no-op', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* program('first')
          const seen: Array<string> = []
          prog.subscribeHtml(dom => void seen.push(dom))

          yield* prog.shutdown
          prog.dispatch({ text: 'second' })

          expect(seen).toEqual(['first'])
        }),
      ),
    ))
})
