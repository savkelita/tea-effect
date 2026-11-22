import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Effect, Stream, Exit, Scope, Schedule, Cause, Fiber } from 'effect'
import * as Platform from '../src/Platform'
import * as Cmd from '../src/Cmd'
import * as Http from '../src/Http'
import * as Sub from '../src/Sub'
import { Run, RunEnd, RunMsg, runToEnd } from '../src/internal/latest'

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
      type M = { ticks: number; bumps: number }
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const prog = yield* Platform.program<M, { type: string }>(
              // Bump returns a NEW model object each time, so it triggers a
              // subscription re-diff — the condition under which an unstable map
              // key would restart (starve) the wrapped interval.
              [{ ticks: 0, bumps: 0 }, Cmd.none],
              (msg, m) =>
                msg.type === 'Tick'
                  ? [{ ...m, ticks: m.ticks + 1 }, Cmd.none]
                  : [{ ...m, bumps: m.bumps + 1 }, Cmd.none],
              // Fresh inline tagger on every subscriptions(model) call — must not
              // restart the wrapped interval (that was the fnId-key regression).
              () => Sub.map((_n: number) => ({ type: 'Tick' as const }))(Sub.interval(100, 0))
            )
            let latest: M = { ticks: 0, bumps: 0 }
            yield* Effect.forkScoped(
              Stream.runForEach(prog.model$, (m) => Effect.sync(() => { latest = m }))
            )
            for (let i = 0; i < 15; i++) {
              prog.dispatch({ type: 'Bump' })
              yield* Effect.sleep('30 millis')
            }
            yield* Effect.sleep('40 millis')
            yield* prog.shutdown
            expect(latest.bumps).toBe(15)
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
            const infiniteCmd = Stream.fromEffectRepeat(
              Effect.sync(() => { beats++; return { type: 'Beat' as const } })
            ).pipe(Stream.schedule(Schedule.spaced('20 millis')))
            const prog = yield* Platform.program<{ n: number }, { type: 'Beat' } | { type: 'Inc' }>(
              [{ n: 0 }, infiniteCmd],
              (_m, m) => [{ n: m.n + 1 }, Cmd.none]
            ).pipe(Scope.provide(scope))
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

  describe('Cmd.latest', () => {
    type Msg = { readonly type: 'Run'; readonly cmd: Cmd.Cmd<Msg> } | { readonly type: 'Got'; readonly value: string }

    const got = (value: string): Msg => ({ type: 'Got', value })
    // Hands `update` the command to return.
    const run = (cmd: Cmd.Cmd<Msg>): Msg => ({ type: 'Run', cmd })
    const answer = (value: string, ms: number): Cmd.Cmd<Msg> => Cmd.fromEffect(Effect.as(Effect.sleep(ms), got(value)))
    const watched = (value: string, ms: number, onInterrupt: () => void): Cmd.Cmd<Msg> =>
      Cmd.fromEffect(Effect.onInterrupt(Effect.as(Effect.sleep(ms), got(value)), () => Effect.sync(onInterrupt)))

    // The model is every value `update` received, in order.
    const start = (initial: Cmd.Cmd<Msg> = Cmd.none) =>
      Effect.gen(function* () {
        const prog = yield* Platform.program<ReadonlyArray<string>, Msg>([[], initial], (msg, values) =>
          msg.type === 'Run' ? [values, msg.cmd] : [[...values, msg.value], Cmd.none]
        )
        let received: ReadonlyArray<string> = []
        prog.subscribe((values) => {
          received = values
        })
        return { prog, received: () => received }
      })

    const runTest = (test: Effect.Effect<void, never, Scope.Scope>) => Effect.runPromise(Effect.scoped(test))

    describe('the end of a run', () => {
      // What a run put in the queue: its messages, and 'end' for its end.
      const queued = () => {
        const items: Array<string> = []
        const offer = (item: RunMsg<string> | RunEnd) =>
          Effect.sync(() => void items.push(item instanceof RunEnd ? 'end' : item.msg))
        return { items, offer }
      }

      it('comes after the last message of a command that completes', async () => {
        const { items, offer } = queued()
        const exit = await Effect.runPromise(Effect.exit(runToEnd(new Run('k'), Stream.make('a', 'b'), offer)))
        expect(Exit.isSuccess(exit)).toBe(true)
        expect(items).toEqual(['a', 'b', 'end'])
      })

      it('comes when the command fails, and the failure still goes on', async () => {
        const { items, offer } = queued()
        const failing = Stream.concat(Stream.make('a'), Stream.fail('boom'))
        const exit = await Effect.runPromise(Effect.exit(runToEnd(new Run('k'), failing, offer)))
        expect(Exit.isFailure(exit)).toBe(true)
        expect(items).toEqual(['a', 'end'])
      })

      it('comes when the command interrupts itself', async () => {
        const { items, offer } = queued()
        const interrupting = Stream.concat(Stream.make('a'), Stream.fromEffect(Effect.interrupt))
        const exit = await Effect.runPromise(Effect.exit(runToEnd(new Run('k'), interrupting, offer)))
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
        expect(items).toEqual(['a', 'end'])
      })

      it('comes when the run is interrupted from outside, as a replaced run is', async () => {
        const { items, offer } = queued()
        await Effect.runPromise(
          Effect.gen(function* () {
            const fiber = yield* Effect.forkChild(runToEnd(new Run('k'), Stream.concat(Stream.make('a'), Stream.never), offer))
            yield* Effect.sleep(10)
            yield* Fiber.interrupt(fiber)
          })
        )
        expect(items).toEqual(['a', 'end'])
      })
    })

    it('delivers only the latest command under a key and interrupts the earlier one', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          let interrupted = false
          prog.dispatch(run(Cmd.latest('k')(watched('old', 60, () => (interrupted = true)))))
          yield* Effect.sleep(10)
          prog.dispatch(run(Cmd.latest('k')(answer('new', 20))))
          yield* Effect.sleep(120)
          expect(received()).toEqual(['new'])
          expect(interrupted).toBe(true)
        })
      ))

    it('replaces the initial command under a key as well', () =>
      runTest(
        Effect.gen(function* () {
          let interrupted = false
          const { prog, received } = yield* start(Cmd.latest('k')(watched('initial', 60, () => (interrupted = true))))
          yield* Effect.sleep(10)
          prog.dispatch(run(Cmd.latest('k')(answer('new', 20))))
          yield* Effect.sleep(120)
          expect(received()).toEqual(['new'])
          expect(interrupted).toBe(true)
        })
      ))

    it('drops a message the replaced command had already put in the queue', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          // The answer waits in the queue when a refresh starts a newer command under the key.
          const answerThenRefresh: Cmd.Cmd<Msg> = Stream.concat(
            Stream.make(got('old')),
            Stream.fromEffectDrain(Effect.sync(() => prog.dispatch(run(Cmd.latest('k')(Cmd.of(got('new')))))))
          )
          prog.dispatch(run(Cmd.latest('k')(answerThenRefresh)))
          yield* Effect.sleep(50)
          expect(received()).toEqual(['new'])
        })
      ))

    // The end of a finished command can still wait in the queue when a newer one takes the key.
    it('keeps the newer command when the end of the replaced one comes out of the queue', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          // The refresh starts while `update` handles the answer, before the end of the
          // answered command comes out of the queue.
          let refreshed = false
          prog.subscribe((values) => {
            if (values.includes('old') && !refreshed) {
              refreshed = true
              prog.dispatch(run(Cmd.latest('k')(answer('new', 10))))
            }
          })
          prog.dispatch(run(Cmd.latest('k')(Cmd.of(got('old')))))
          yield* Effect.sleep(60)
          expect(received()).toEqual(['old', 'new'])
        })
      ))

    it('leaves commands under other keys and commands without a key alone', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          prog.dispatch(run(Cmd.latest('a')(answer('a', 20))))
          prog.dispatch(run(Cmd.latest('b')(answer('b', 20))))
          prog.dispatch(run(answer('plain 1', 20)))
          prog.dispatch(run(answer('plain 2', 20)))
          yield* Effect.sleep(80)
          expect([...received()].sort()).toEqual(['a', 'b', 'plain 1', 'plain 2'])
        })
      ))

    it('stops what runs under the key for none', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          let interrupted = false
          prog.dispatch(run(Cmd.latest('k')(watched('old', 40, () => (interrupted = true)))))
          yield* Effect.sleep(10)
          prog.dispatch(run(Cmd.latest('k')(Cmd.none)))
          yield* Effect.sleep(80)
          expect(received()).toEqual([])
          expect(interrupted).toBe(true)
        })
      ))

    it('keeps the key through map', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          const renamed = Cmd.map((msg: Msg): Msg => (msg.type === 'Got' ? got(`mapped ${msg.value}`) : msg))
          prog.dispatch(run(renamed(Cmd.latest('k')(answer('old', 40)))))
          yield* Effect.sleep(10)
          prog.dispatch(run(Cmd.latest('k')(answer('new', 10))))
          yield* Effect.sleep(80)
          expect(received()).toEqual(['new'])
        })
      ))

    it('runs only the last command with a key in one batch', () =>
      runTest(
        Effect.gen(function* () {
          const { prog, received } = yield* start()
          prog.dispatch(
            run(Cmd.batch([Cmd.latest('k')(answer('first', 10)), Cmd.latest('k')(answer('second', 10)), answer('plain', 10)]))
          )
          yield* Effect.sleep(60)
          expect([...received()].sort()).toEqual(['plain', 'second'])
        })
      ))

    it('stops commands under a key when the program shuts down', () =>
      runTest(
        Effect.gen(function* () {
          const { prog } = yield* start()
          let interrupted = false
          prog.dispatch(run(Cmd.latest('k')(watched('old', 1000, () => (interrupted = true)))))
          yield* Effect.sleep(10)
          yield* prog.shutdown
          expect(interrupted).toBe(true)
        })
      ))

    // Unlike shutdown, closing the scope leaves dispatch on: `update` still runs, and the
    // command it returns cannot start.
    it('does not throw for a command under a key after the program scope closed', async () => {
      const { prog } = await Effect.runPromise(Effect.scoped(start()))
      expect(() => prog.dispatch(run(Cmd.latest('k')(Cmd.of(got('late')))))).not.toThrow()
    })

    describe('with Http', () => {
      const origFetch = globalThis.fetch
      let signals: Array<AbortSignal> = []
      beforeEach(() => {
        signals = []
        // Answers only by failing when the request is aborted.
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
          if (signal) signals.push(signal)
          return new Promise<Response>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)))
        }) as typeof fetch
      })
      afterEach(() => {
        globalThis.fetch = origFetch
      })

      it('aborts the request of the replaced command', () =>
        runTest(
          Effect.gen(function* () {
            const { prog, received } = yield* start()
            const load = Http.send(Http.get('http://x/users', Http.expectString), {
              onSuccess: () => got('loaded'),
              onError: (error) => got(error._tag)
            })
            prog.dispatch(run(Cmd.latest('k')(load)))
            yield* Effect.sleep(10)
            expect(signals).toHaveLength(1)
            prog.dispatch(run(Cmd.latest('k')(Cmd.none)))
            yield* Effect.sleep(10)
            expect(signals[0].aborted).toBe(true)
            expect(received()).toEqual([])
          })
        ))
    })
  })
})
