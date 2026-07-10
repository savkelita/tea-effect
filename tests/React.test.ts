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

  // Regression tests for audited bugs (see AUDIT.md). A minimal ReactLike
  // harness mimics render-then-flush-effects ordering and React's real
  // useState/setState function semantics.
  describe('AUDIT regressions', () => {
    const makeHarness = () => {
      const states: any[] = []
      const refs: any[] = []
      let effects: Array<() => void | (() => void)> = []
      let si = 0
      let ri = 0
      const React: TeaReact.ReactLike = {
        useState: (init: any) => {
          const i = si++
          if (!(i in states)) states[i] = typeof init === 'function' ? init() : init
          return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v }]
        },
        useRef: (init: any) => {
          const i = ri++
          if (!refs[i]) refs[i] = { current: init }
          return refs[i]
        },
        useEffect: (fn: any) => { effects.push(fn) }
      }
      return {
        React,
        states,
        render(run: () => any) { si = 0; ri = 0; effects = []; return run() },
        flush() { effects.forEach((e) => e()) }
      }
    }
    const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

    it('#4: a message dispatched before the program starts is buffered and delivered', async () => {
      type Model = { n: number }
      type Msg = { type: 'Load' }
      const h = makeHarness()
      const useProgram = TeaReact.makeUseProgram(h.React)
      const r = h.render(() =>
        useProgram<Model, Msg>([{ n: 0 }, Cmd.none], (msg, m) => (msg.type === 'Load' ? [{ n: m.n + 1 }, Cmd.none] : [m, Cmd.none]))
      )
      r.dispatch({ type: 'Load' }) // before the mount effect flushes
      h.flush()
      await tick()
      expect(h.states[0].n).toBe(1)
    })

    it('#15: the program uses the latest update closure, not the first render\'s', async () => {
      type Model = { sends: number }
      type Msg = { type: 'Send' }
      const sends: string[] = []
      const h = makeHarness()
      const useProgram = TeaReact.makeUseProgram(h.React)
      const renderWith = (userId: string) =>
        h.render(() =>
          useProgram<Model, Msg>([{ sends: 0 }, Cmd.none], (msg, m) =>
            msg.type === 'Send' ? (sends.push(userId), [{ sends: m.sends + 1 }, Cmd.none]) : [m, Cmd.none]
          )
        )
      renderWith('alice')
      h.flush()
      await tick()
      const r = renderWith('bob') // re-render with a new prop; [] deps effect does not re-run
      r.dispatch({ type: 'Send' })
      r.dispatch({ type: 'Send' })
      await tick()
      expect(sends).toEqual(['bob', 'bob'])
    })

    it('#28: a function-typed model is stored, not invoked', async () => {
      type Model = (input: string) => boolean
      type Msg = { type: 'Noop' }
      const validator: Model = (s) => s.length > 0
      const h = makeHarness()
      const useProgram = TeaReact.makeUseProgram(h.React)
      h.render(() => useProgram<Model, Msg>([validator, Cmd.none], (_msg, m) => [m, Cmd.none]))
      h.flush()
      await tick()
      expect(typeof h.states[0]).toBe('function')
      expect(h.states[0]).toBe(validator)
      expect(h.states[0]('hello')).toBe(true)
    })
  })
})
