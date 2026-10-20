/**
 * Asking the user for files.
 *
 * See the [File.Select](https://package.elm-lang.org/packages/elm/file/latest/File-Select) Elm package.
 *
 * Browsers open the file picker only in response to a user action. The command
 * runs right after the message a click produced, so return it from `update`
 * when handling that click - not from `init` or a subscription.
 *
 * Browsers that fire `cancel` end the command with no message when the picker
 * is dismissed. One that does not leaves the command pending, which does no harm.
 *
 * @since 0.10.0
 */
import { Array as Arr, Effect, Stream } from 'effect'
import type { Cmd } from '../Cmd'

// The input stays in the document while the picker is open, so nothing collects
// it before `change` fires.
const pick = (accept: ReadonlyArray<string>, multiple: boolean): Effect.Effect<ReadonlyArray<File>> =>
  Effect.callback<ReadonlyArray<File>>((resume) => {
    if (typeof document === 'undefined') {
      resume(Effect.succeed([]))
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept.join(',')
    input.multiple = multiple
    input.style.display = 'none'
    const close = (): void => {
      input.removeEventListener('change', done)
      input.removeEventListener('cancel', done)
      input.remove()
    }
    const done = (): void => {
      close()
      resume(Effect.succeed(Array.from(input.files ?? [])))
    }
    input.addEventListener('change', done)
    input.addEventListener('cancel', done)
    document.body.append(input)
    input.click()
    return Effect.sync(close)
  })

// -------------------------------------------------------------------------------------
// commands
// -------------------------------------------------------------------------------------

/**
 * Asks the user for one file.
 *
 * `accept` lists MIME types and extensions, as the `accept` attribute does; an
 * empty list allows any file.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * type Msg = { readonly type: 'CsvSelected'; readonly file: File.File }
 *
 * // Return it from update, when handling the click on "Import".
 * const chooseCsv = File.Select.file(['text/csv', '.csv'], (file): Msg => ({ type: 'CsvSelected', file }))
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const file = <Msg>(accept: ReadonlyArray<string>, toMsg: (file: File) => Msg): Cmd<Msg> =>
  Stream.fromEffect(pick(accept, false)).pipe(Stream.flatMap((files) => Stream.fromIterable(files.slice(0, 1).map(toMsg))))

/**
 * Asks the user for one or more files.
 *
 * The message gets a non-empty array: dismissing the picker sends nothing, so
 * there is no empty case to handle.
 *
 * @example
 * ```ts
 * import type { Array } from 'effect'
 * import * as File from 'tea-effect/File'
 *
 * type Msg = { readonly type: 'PhotosSelected'; readonly photos: Array.NonEmptyReadonlyArray<File.File> }
 *
 * const choosePhotos = File.Select.files(['image/*'], (photos): Msg => ({ type: 'PhotosSelected', photos }))
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const files = <Msg>(
  accept: ReadonlyArray<string>,
  toMsg: (files: Arr.NonEmptyReadonlyArray<File>) => Msg
): Cmd<Msg> =>
  Stream.fromEffect(pick(accept, true)).pipe(
    Stream.flatMap((files) => (Arr.isReadonlyArrayNonEmpty(files) ? Stream.make(toMsg(files)) : Stream.empty))
  )
