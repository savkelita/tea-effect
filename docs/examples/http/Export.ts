import * as Cmd from 'tea-effect/Cmd'
import * as File from 'tea-effect/File'
import type * as Http from 'tea-effect/Http'
import { usersFile } from './api'

export type Model = {
  readonly exporting: boolean
  readonly saved: string | null
  readonly error: Http.HttpError | null
}

export type Msg =
  | { readonly type: 'ExportRequested' }
  | { readonly type: 'Exported'; readonly name: string }
  | { readonly type: 'ExportFailed'; readonly error: Http.HttpError }

export const init: readonly [Model, Cmd.Cmd<Msg>] = [{ exporting: false, saved: null, error: null }, Cmd.none]

// #region update
const Exported = (name: string): Msg => ({ type: 'Exported', name })
const ExportFailed = (error: Http.HttpError): Msg => ({ type: 'ExportFailed', error })

export const update = (msg: Msg, model: Model): readonly [Model, Cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'ExportRequested':
      // A second click while the first export runs would save the file twice.
      if (model.exporting) {
        return [model, Cmd.none]
      }
      // The Cmd fetches the file and saves it; only its name comes back.
      return [
        { ...model, exporting: true, error: null },
        File.Download.send(usersFile, { onSuccess: Exported, onError: ExportFailed })
      ]
    case 'Exported':
      return [{ exporting: false, saved: msg.name, error: null }, Cmd.none]
    case 'ExportFailed':
      return [{ ...model, exporting: false, error: msg.error }, Cmd.none]
  }
}
// #endregion update
