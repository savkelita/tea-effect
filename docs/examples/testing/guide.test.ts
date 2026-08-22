import { Chunk, Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Platform from 'tea-effect/Platform'
import * as Counter from '../counter/Counter'
import { ApiClientTest } from '../di/ApiClient'
import * as Dice from '../mental-model/Dice'
import * as Users from '../di/Users'

// #region pure
describe('update', () => {
  it('is an ordinary function: call it, compare the result', () => {
    const [model] = Counter.update({ type: 'Increment' }, { count: 0 })

    expect(model).toEqual({ count: 1 })
  })

  it('needs no renderer, no mocks and nothing async', () => {
    const [model] = Counter.update({ type: 'Reset' }, { count: 41 })

    expect(model).toEqual({ count: 0 })
  })
})
// #endregion pure

// #region cmd
describe('commands', () => {
  it('a Cmd is a Stream of messages - run it to see what it produces', async () => {
    const [model, cmd] = Dice.update({ type: 'Roll' }, { face: 1, rolling: false })

    // The model records the roll immediately; the number is not known yet.
    expect(model).toEqual({ face: 1, rolling: true })

    const messages = Chunk.toReadonlyArray(await Effect.runPromise(Stream.runCollect(cmd)))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ type: 'Rolled' })
  })
})
// #endregion cmd

// #region layer
describe('a command that requires a service', () => {
  it('runs against a test layer - same tag, different value behind it', async () => {
    const [, cmd] = Users.update({ type: 'LoadRequested' }, { _tag: 'Idle' })

    // `cmd` has ApiClient in its `R`. Providing the test layer discharges it.
    const messages = Chunk.toReadonlyArray(
      await Effect.runPromise(Stream.runCollect(cmd).pipe(Effect.provide(ApiClientTest([]))))
    )

    expect(messages).toEqual([{ type: 'UsersReceived', users: [] }])
  })
})
// #endregion layer

// #region program
describe('a whole program', () => {
  it('applies update synchronously, before dispatch returns', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const program = yield* Platform.program(Counter.init, Counter.update)

          const seen: Array<number> = []
          // `subscribe` fires once with the current model, then inside every dispatch.
          const stop = program.subscribe((model) => seen.push(model.count))

          program.dispatch({ type: 'Increment' })
          program.dispatch({ type: 'Increment' })
          program.dispatch({ type: 'Decrement' })

          // No awaiting, no flushing: the values are already there.
          expect(seen).toEqual([0, 1, 2, 1])

          stop()
          yield* program.shutdown
        })
      )
    )
  })
})
// #endregion program
