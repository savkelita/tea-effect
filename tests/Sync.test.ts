import { Effect, Stream } from 'effect'
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

  // Applied nested, the inner message reached the second listener before the outer
  // one did, which left it rendering the older model.
  it('should apply a dispatch from a listener after every listener saw the current model', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* Platform.program<number, 'outer' | 'inner'>([0, Cmd.none], (_msg, n) => [n + 1, Cmd.none])
          const second: Array<number> = []
          prog.subscribe(n => {
            if (n === 1) prog.dispatch('inner')
          })
          prog.subscribe(n => void second.push(n))

          prog.dispatch('outer')

          expect(second).toEqual([0, 1, 2])
        }),
      ),
    ))

  it('should keep notifying listeners and run the command when a listener throws', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const log: Array<string> = []
          const prog = yield* Platform.program<number, 'go' | 'done'>([0, Cmd.none], (msg, n) => [
            n + 1,
            msg === 'go' ? Cmd.fromEffect(Effect.sync(() => (log.push('cmd'), 'done' as const))) : Cmd.none,
          ])
          prog.subscribe(n => {
            if (n === 1) throw new Error('listener')
          })
          prog.subscribe(n => void log.push(`model ${n}`))
          log.length = 0

          prog.dispatch('go')

          expect(log).toEqual(['model 1', 'cmd'])
          const failure = yield* Effect.flip(Effect.catchDefect(Stream.runDrain(prog.model$), defect => Effect.fail(defect)))
          expect(String(failure)).toContain('listener')
        }),
      ),
    ))

  it('should still apply the messages queued behind an update that throws', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const applied: Array<string> = []
          const prog = yield* Platform.program<number, string>([0, Cmd.none], (msg, n) => {
            if (msg === 'bad') throw new Error('update')
            applied.push(msg)
            return [n + 1, Cmd.none]
          })
          prog.subscribe(n => {
            if (n !== 1) return
            prog.dispatch('bad')
            prog.dispatch('after')
          })

          prog.dispatch('first')

          expect(applied).toEqual(['first', 'after'])
        }),
      ),
    ))
})
