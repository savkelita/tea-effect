import { describe, it, expect, afterEach } from 'vitest'
import { Deferred, Effect, Exit, Fiber, Stream } from 'effect'
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'
import * as Http from '../src/Http'
import * as Platform from '../src/Platform'

// Effect 3 behaviour that a straight Effect 4 port loses. Each test fails without
// the matching workaround in src.
describe('Effect 4 regressions', () => {
  it('a model$ consumer that dispatches synchronously does not throw', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const prog = yield* Platform.program<number, 'inc'>([0, Cmd.none], (_msg, n) => [n + 1, Cmd.none])
          const seen: Array<number> = []
          prog.subscribe((n) => void seen.push(n))
          const errors: Array<unknown> = []
          const ready = yield* Deferred.make<void>()
          yield* Effect.forkScoped(
            Stream.runForEach(prog.model$, (n) =>
              Effect.sync(() => {
                if (n === 0) Deferred.doneUnsafe(ready, Exit.void)
                if (n !== 1) return
                try {
                  prog.dispatch('inc')
                } catch (e) {
                  errors.push(e)
                }
              })
            )
          )
          // Let the consumer go idle, so dispatch resumes it inside SubscriptionRef.set.
          yield* Deferred.await(ready)
          yield* Effect.sleep('5 millis')

          prog.dispatch('inc')
          yield* Effect.sleep('10 millis')

          expect(errors).toEqual([])
          expect(seen).toEqual([0, 1, 2])
        })
      )
    ))

  it('a CPU-heavy cmd started from dispatch does not starve timers', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let yields = 0
          const heavy: Cmd.Cmd<'done'> = Stream.fromEffect(
            Effect.gen(function* () {
              for (let i = 0; i < 5000; i++) {
                yields++
                yield* Effect.yieldNow
              }
              return 'done' as const
            })
          )
          const prog = yield* Platform.program<number, 'go' | 'done'>([0, Cmd.none], (msg, n) => [
            n + 1,
            msg === 'go' ? heavy : Cmd.none
          ])
          let timerAt = -1
          prog.dispatch('go')
          setTimeout(() => {
            timerAt = yields
          }, 0)
          yield* Effect.sleep('500 millis')

          expect(timerAt).toBeGreaterThanOrEqual(0)
          expect(timerAt).toBeLessThan(5000)
        })
      )
    ))

  it('Sub.fromCallback registers when the sub starts and cleans up only on interruption', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const log: Array<string> = []
        const sub = Sub.fromCallback<number>((emit) => {
          log.push('registered')
          emit(1)
          return () => void log.push('cleanup')
        })
        const got: Array<number> = []
        const fiber = yield* Effect.forkChild(
          Stream.runForEach(sub, (n) => Effect.sync(() => void got.push(n))),
          { startImmediately: true }
        )
        expect(log).toEqual(['registered'])
        yield* Effect.sleep('10 millis')
        expect(got).toEqual([1])
        expect(log).toEqual(['registered'])
        yield* Fiber.interrupt(fiber)
        expect(log).toEqual(['registered', 'cleanup'])
      })
    ))

  describe('Http', () => {
    const origFetch = globalThis.fetch
    afterEach(() => {
      globalThis.fetch = origFetch
    })

    it('reads globalThis.fetch per request, so a stub installed later is used', async () => {
      const calls: Array<string> = []
      const stub = (name: string) =>
        (async () => {
          calls.push(name)
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        }) as unknown as typeof fetch
      const run = () => Effect.runPromise(Effect.result(Http.toTask(Http.get('http://x/api', Http.expectWhatever))))

      globalThis.fetch = stub('A')
      await run()
      globalThis.fetch = stub('B')
      await run()

      expect(calls).toEqual(['A', 'B'])
    })

    it('a rejected fetch is a NetworkError, not a BadBody', async () => {
      globalThis.fetch = (async () => {
        throw new TypeError('offline')
      }) as unknown as typeof fetch
      const result = await Effect.runPromise(
        Effect.result(Http.toTask(Http.get('http://x/api', Http.expectWhatever)))
      )
      expect(result._tag === 'Failure' && result.failure._tag).toBe('NetworkError')
    })
  })
})
