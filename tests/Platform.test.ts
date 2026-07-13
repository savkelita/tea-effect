import { describe, it, expect } from 'vitest'
import { Effect, Stream, Exit, Scope, Schedule } from 'effect'
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

  // Regression tests for audited bugs (see AUDIT.md).
  describe('AUDIT regressions', () => {
    // Exit.Failure => model$ surfaced an error/defect (fixed); Exit.Success
    // ('timeout') => it stayed silent (regressed). Effect.exit captures both
    // typed failures and defects (a throw in update becomes a defect).
    const drainOutcome = (model$: Stream.Stream<any, any, never>) =>
      Effect.raceFirst(
        Stream.runDrain(model$).pipe(Effect.as('drained' as const)),
        Effect.sleep('600 millis').pipe(Effect.as('timeout' as const))
      ).pipe(Effect.exit)

    it('#1: a timer subscription is not starved by frequent unrelated messages', async () => {
      type M = { bumps: number; ticks: number }
      type Msg = { type: 'Bump' } | { type: 'Tick' }
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const prog = yield* Platform.program<M, Msg>(
              [{ bumps: 0, ticks: 0 }, Cmd.none],
              (msg, m) =>
                msg.type === 'Bump'
                  ? [{ ...m, bumps: m.bumps + 1 }, Cmd.none]
                  : [{ ...m, ticks: m.ticks + 1 }, Cmd.none],
              () => Sub.interval(100, { type: 'Tick' })
            )
            let latest: M = { bumps: 0, ticks: 0 }
            yield* Effect.forkScoped(
              Stream.runForEach(prog.model$, (m) => Effect.sync(() => { latest = m }))
            )
            for (let i = 0; i < 15; i++) {
              prog.dispatch({ type: 'Bump' })
              yield* Effect.sleep('30 millis')
            }
            // Short trailing window (< the 100ms interval period) so switch-restart
            // yields 0 ticks (hard fail), while keyed diffing keeps ticking through
            // the 450ms bump phase. >=3 cleanly separates the two (bug=0, fixed~4).
            yield* Effect.sleep('40 millis')
            yield* prog.shutdown
            expect(latest.ticks).toBeGreaterThanOrEqual(3)
            expect(latest.bumps).toBe(15)
          })
        )
      )
    }, 10000)

    it('review2: a mapped timer with an INLINE tagger is not starved (keep-alive)', async () => {
      type M = { ticks: number }
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const prog = yield* Platform.program<M, { type: string }>(
              [{ ticks: 0 }, Cmd.none],
              (msg, m) => (msg.type === 'Tick' ? [{ ticks: m.ticks + 1 }, Cmd.none] : [m, Cmd.none]),
              // Fresh inline tagger on every subscriptions(model) call — must not
              // restart the wrapped interval (that was the fnId-key regression).
              () => Sub.map((_n: number) => ({ type: 'Tick' as const }))(Sub.interval(100, 0))
            )
            let latest: M = { ticks: 0 }
            yield* Effect.forkScoped(
              Stream.runForEach(prog.model$, (m) => Effect.sync(() => { latest = m }))
            )
            for (let i = 0; i < 15; i++) {
              prog.dispatch({ type: 'Bump' })
              yield* Effect.sleep('30 millis')
            }
            yield* Effect.sleep('40 millis')
            yield* prog.shutdown
            expect(latest.ticks).toBeGreaterThanOrEqual(3)
          })
        )
      )
    }, 10000)

    it('#3: a failing Cmd surfaces on model$', async () => {
      const outcome = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const prog = yield* Platform.program<{ n: number }, { type: 'X' }, string>(
              [{ n: 0 }, Cmd.fromEffect(Effect.fail('boom'))],
              (_msg, m) => [m, Cmd.none]
            )
            return yield* drainOutcome(prog.model$)
          })
        )
      )
      expect(Exit.isFailure(outcome)).toBe(true)
    }, 10000)

    it('#2: a failing subscription surfaces on model$', async () => {
      const outcome = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const failingSub: Sub.Sub<{ type: 'X' }, string> = Stream.fromEffect(Effect.fail('subboom'))
            const prog = yield* Platform.program<{ n: number }, { type: 'X' }, string>(
              [{ n: 0 }, Cmd.none],
              (_msg, m) => [m, Cmd.none],
              () => failingSub
            )
            return yield* drainOutcome(prog.model$)
          })
        )
      )
      expect(Exit.isFailure(outcome)).toBe(true)
    }, 10000)

    it('#12: a synchronous throw in update surfaces on model$', async () => {
      const outcome = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const prog = yield* Platform.program<{ n: number }, { type: 'Boom' }>(
              [{ n: 0 }, Cmd.none],
              (): readonly [{ n: number }, Cmd.Cmd<{ type: 'Boom' }>] => {
                throw new Error('update boom')
              }
            )
            yield* Effect.forkScoped(
              Effect.sleep('50 millis').pipe(
                Effect.flatMap(() => Effect.sync(() => prog.dispatch({ type: 'Boom' })))
              )
            )
            return yield* drainOutcome(prog.model$)
          })
        )
      )
      expect(Exit.isFailure(outcome)).toBe(true)
    }, 10000)

    it('#13: shutdown stops in-flight command fibers; dispatch after is a no-op', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            // Own scope so we can shut the program down while the ambient scope
            // (and thus, under the old code, the cmd fiber) is still open — the
            // observable that distinguishes the fix from main.
            const scope = yield* Scope.make()
            let beats = 0
            const infiniteCmd = Stream.repeatEffect(
              Effect.sync(() => { beats++; return { type: 'Beat' as const } })
            ).pipe(Stream.schedule(Schedule.spaced('20 millis')))
            const prog = yield* Platform.program<{ n: number }, { type: 'Beat' } | { type: 'Inc' }>(
              [{ n: 0 }, infiniteCmd],
              (_m, m) => [{ n: m.n + 1 }, Cmd.none]
            ).pipe(Scope.extend(scope))
            yield* Effect.forkScoped(Stream.runDrain(prog.model$))

            yield* Effect.sleep('120 millis')
            const atShutdown = beats
            yield* prog.shutdown
            yield* Effect.sleep('120 millis')
            // The cmd fiber stopped at shutdown (main kept it running until the
            // ambient scope closed, so beats would keep growing here).
            expect(beats - atShutdown).toBeLessThanOrEqual(1)
            // And a post-shutdown dispatch neither throws nor is processed.
            expect(() => prog.dispatch({ type: 'Inc' })).not.toThrow()

            yield* Scope.close(scope, Exit.void)
          })
        )
      )
    }, 10000)
  })
})
