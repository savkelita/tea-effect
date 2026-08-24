import * as Cmd from 'tea-effect/Cmd'
import * as Sub from 'tea-effect/Sub'
import type * as TeaReact from 'tea-effect/React'

export type Model = {
  readonly seconds: number
  readonly running: boolean
}

export type Msg =
  | { readonly type: 'Tick' }
  | { readonly type: 'Toggle' }
  | { readonly type: 'Reset' }

export const init: readonly [Model, Cmd.Cmd<Msg>] = [
  { seconds: 0, running: false },
  Cmd.none
]

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Tick':
      return [{ ...model, seconds: model.seconds + 1 }, Cmd.none]

    case 'Toggle':
      return [{ ...model, running: !model.running }, Cmd.none]

    case 'Reset':
      return [{ ...model, seconds: 0 }, Cmd.none]
  }
}

// #region subscriptions
const Tick: Msg = { type: 'Tick' }

// Declarative: describe which sources should be live for THIS model, and the
// runtime works out the difference. A `Tick` changing `seconds` re-runs this
// function, but the interval's key is unchanged, so the same timer keeps
// running - it is not reset. Flipping `running` IS the delta: off interrupts
// the interval, on starts a fresh one.
export const subscriptions = (model: Model): Sub.Sub<Msg> =>
  model.running ? Sub.interval(1000, Tick) : Sub.none
// #endregion subscriptions

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <div>
      <span>{model.seconds}s</span>
      <button onClick={() => dispatch({ type: 'Toggle' })}>
        {model.running ? 'Stop' : 'Start'}
      </button>
      <button onClick={() => dispatch({ type: 'Reset' })}>Reset</button>
    </div>
  )
