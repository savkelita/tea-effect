import * as Cmd from 'tea-effect/Cmd'
import type * as TeaReact from 'tea-effect/React'

// A small, self-contained module. It knows nothing about any parent.
export type Model = {
  readonly value: string
  readonly touched: boolean
}

export type Msg =
  | { readonly type: 'Changed'; readonly value: string }
  | { readonly type: 'Blurred' }

export const init = (value: string): readonly [Model, Cmd.Cmd<Msg>] => [
  { value, touched: false },
  Cmd.none
]

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Changed':
      return [{ ...model, value: msg.value }, Cmd.none]

    case 'Blurred':
      return [{ ...model, touched: true }, Cmd.none]
  }
}

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <input
      value={model.value}
      onChange={(event) => dispatch({ type: 'Changed', value: event.target.value })}
      onBlur={() => dispatch({ type: 'Blurred' })}
    />
  )
