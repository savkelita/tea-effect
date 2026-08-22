import { Effect } from 'effect'
import * as Cmd from 'tea-effect/Cmd'
import * as Task from 'tea-effect/Task'
import type * as TeaReact from 'tea-effect/React'

export type Model = {
  readonly face: number
  readonly rolling: boolean
}

export type Msg =
  | { readonly type: 'Roll' }
  | { readonly type: 'Rolled'; readonly face: number }

// #region task
// A message constructor. Keep it at module level: a stable reference is what lets
// `Cmd.map` / `Html.map` cache their work further down the tree.
const Rolled = (face: number): Msg => ({ type: 'Rolled', face })

// A description of a side effect. Nothing has happened yet - this is just a value.
// `Task<A, E, R>` is an alias for Effect's own `Effect<A, E, R>`, so every Effect
// already is a Task. The annotation here is only to make that visible.
const rollDie: Task.Task<number> = Effect.sync(() => 1 + Math.floor(Math.random() * 6))
// #endregion task

export const init: readonly [Model, Cmd.Cmd<Msg>] = [{ face: 1, rolling: false }, Cmd.none]

// #region update
export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Roll':
      // `update` does not roll the die. It returns a command that says
      // "run this, and send me back a Rolled message".
      return [{ ...model, rolling: true }, Task.perform(Rolled)(rollDie)]

    case 'Rolled':
      return [{ face: msg.face, rolling: false }, Cmd.none]
  }
}
// #endregion update

export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <div>
      <span>{model.face}</span>
      <button onClick={() => dispatch({ type: 'Roll' })} disabled={model.rolling}>
        Roll
      </button>
    </div>
  )
