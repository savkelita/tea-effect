import * as Cmd from 'tea-effect/Cmd'
import type * as TeaReact from 'tea-effect/React'

// #region model
export type Model = {
  readonly count: number
}
// #endregion model

// #region msg
export type Msg =
  | { readonly type: 'Increment' }
  | { readonly type: 'Decrement' }
  | { readonly type: 'Reset' }
// #endregion msg

// #region init
export const init: readonly [Model, Cmd.Cmd<Msg>] = [{ count: 0 }, Cmd.none]
// #endregion init

// #region update
export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Increment':
      return [{ count: model.count + 1 }, Cmd.none]

    case 'Decrement':
      return [{ count: model.count - 1 }, Cmd.none]

    case 'Reset':
      return [{ count: 0 }, Cmd.none]
  }
}
// #endregion update

// #region view
export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <div>
      <button onClick={() => dispatch({ type: 'Decrement' })}>-</button>
      <span>{model.count}</span>
      <button onClick={() => dispatch({ type: 'Increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'Reset' })}>reset</button>
    </div>
  )
// #endregion view
