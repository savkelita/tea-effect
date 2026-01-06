/**
 * Counter Example
 *
 * A simple counter demonstrating basic TEA pattern with tea-effect.
 */
import * as Cmd from '../src/Cmd'
import * as Sub from '../src/Sub'

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export type Model = {
  readonly count: number
}

export const init: readonly [Model, Cmd.Cmd<Msg>] = [{ count: 0 }, Cmd.none]

// -------------------------------------------------------------------------------------
// Messages
// -------------------------------------------------------------------------------------

export type Msg =
  | { readonly type: 'Increment' }
  | { readonly type: 'Decrement' }
  | { readonly type: 'Reset' }
  | { readonly type: 'SetCount'; readonly count: number }

// Constructors for messages
export const Increment: Msg = { type: 'Increment' }
export const Decrement: Msg = { type: 'Decrement' }
export const Reset: Msg = { type: 'Reset' }
export const SetCount = (count: number): Msg => ({ type: 'SetCount', count })

// -------------------------------------------------------------------------------------
// Update
// -------------------------------------------------------------------------------------

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Increment':
      return [{ count: model.count + 1 }, Cmd.none]

    case 'Decrement':
      return [{ count: model.count - 1 }, Cmd.none]

    case 'Reset':
      return [{ count: 0 }, Cmd.none]

    case 'SetCount':
      return [{ count: msg.count }, Cmd.none]
  }
}

// -------------------------------------------------------------------------------------
// Subscriptions
// -------------------------------------------------------------------------------------

export const subscriptions = (_model: Model): Sub.Sub<Msg> => Sub.none

// -------------------------------------------------------------------------------------
// View (React)
// -------------------------------------------------------------------------------------

// View is defined separately in the component that uses this module
// This keeps the core logic framework-agnostic

export const view = (model: Model) => (dispatch: (msg: Msg) => void) => ({
  count: model.count,
  onIncrement: () => dispatch(Increment),
  onDecrement: () => dispatch(Decrement),
  onReset: () => dispatch(Reset),
})
