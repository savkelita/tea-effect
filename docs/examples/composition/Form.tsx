import * as Cmd from 'tea-effect/Cmd'
import * as Html from 'tea-effect/Html'
import type * as TeaReact from 'tea-effect/React'
import * as Field from './Field'

export type Model = {
  readonly email: Field.Model
  readonly submitted: boolean
}

export type Msg =
  | { readonly type: 'EmailMsg'; readonly msg: Field.Msg }
  | { readonly type: 'Submitted' }

// #region tagger
// The tagger lives at module level, and that placement is load-bearing.
// `Cmd.map` and `Html.map` cache their work per `(f, dispatch)` pair; an inline
// arrow would be a new key on every render and silently defeat the cache.
const EmailMsg = (msg: Field.Msg): Msg => ({ type: 'EmailMsg', msg })
// #endregion tagger

// #region init
// The child hands back its own model and command; the parent stores one and
// re-labels the other. Same two moves as in `update`, just at startup.
const [emailModel, emailCmd] = Field.init('')

export const init: readonly [Model, Cmd.Cmd<Msg>] = [
  { email: emailModel, submitted: false },
  Cmd.map(EmailMsg)(emailCmd)
]
// #endregion init

// #region update
export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'EmailMsg': {
      // Delegate to the child, then re-label whatever command it returned so the
      // runtime sends the resulting messages back to the parent.
      const [email, cmd] = Field.update(msg.msg, model.email)
      return [{ ...model, email }, Cmd.map(EmailMsg)(cmd)]
    }

    case 'Submitted':
      return [{ ...model, submitted: true }, Cmd.none]
  }
}
// #endregion update

// #region view
export const view =
  (model: Model): TeaReact.Html<Msg> =>
  (dispatch) => (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        dispatch({ type: 'Submitted' })
      }}
    >
      {/* The child's view dispatches Field.Msg; `map` wraps each one in EmailMsg. */}
      {Html.map(EmailMsg)(Field.view(model.email))(dispatch)}
      <button type="submit">Save</button>
    </form>
  )
// #endregion view
