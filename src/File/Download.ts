/**
 * Saving files on the user's device.
 *
 * See the [File.Download](https://package.elm-lang.org/packages/elm/file/latest/File-Download) Elm package.
 *
 * Every function here is a `Cmd`: `update` returns it and the runtime saves the
 * file. Neither `update` nor `view` builds a link or touches the DOM.
 *
 * @since 0.10.0
 */
import { Duration, Effect, Stream } from 'effect'
import type { Cmd } from '../Cmd'
import * as Http from '../Http'

// Safari and Firefox can cancel a download whose object URL is revoked right
// after the click, so the URL outlives it.
const REVOKE_AFTER = Duration.seconds(40)

const click = (href: string, name: string): void => {
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.style.display = 'none'
  // A link to another origin cannot be downloaded; open it in a new tab rather
  // than navigating away from the application.
  if (link.origin !== location.origin) {
    link.target = '_blank'
    link.rel = 'noopener'
  }
  document.body.append(link)
  link.click()
  link.remove()
}

const save = (file: File): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (typeof document === 'undefined') return
    const url = yield* Effect.sync(() => URL.createObjectURL(file))
    yield* Effect.sync(() => click(url, file.name))
    yield* Effect.forkDetach(Effect.sleep(REVOKE_AFTER).pipe(Effect.andThen(Effect.sync(() => URL.revokeObjectURL(url)))))
  })

const saveAs = (parts: ReadonlyArray<BlobPart>, name: string, mime: string): Effect.Effect<void> =>
  Effect.suspend(() => save(new File([...parts], name, { type: mime })))

// -------------------------------------------------------------------------------------
// commands
// -------------------------------------------------------------------------------------

/**
 * Saves a file on the user's device, as a download link would.
 *
 * Without a `document` - during server rendering, for example - it does nothing.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * // Save again a file the user picked earlier.
 * const saveAgain = (picked: File.File) => File.Download.file(picked)
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const file = <Msg = never>(file: File): Cmd<Msg> => Stream.fromEffectDrain(save(file))

/**
 * Saves text as a file with the given name and MIME type.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * const saveCsv = File.Download.text('users.csv', 'text/csv', 'id,name\n1,Ana\n')
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const text = <Msg = never>(name: string, mime: string, content: string): Cmd<Msg> =>
  Stream.fromEffectDrain(saveAs([content], name, mime))

/**
 * Saves bytes as a file with the given name and MIME type.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * const savePdf = (pdf: Uint8Array<ArrayBuffer>) => File.Download.bytes('report.pdf', 'application/pdf', pdf)
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const bytes = <Msg = never>(name: string, mime: string, content: Uint8Array<ArrayBuffer>): Cmd<Msg> =>
  Stream.fromEffectDrain(saveAs([content], name, mime))

/**
 * Lets the browser download a URL itself, naming the file from its
 * `Content-Disposition`.
 *
 * The file goes straight to disk, so this suits files too large to hold in
 * memory. The application learns nothing, though - neither when the download
 * ends nor whether it failed. A URL on another origin opens in a new tab, as
 * browsers download only same-origin links.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * const saveArchive = File.Download.url('/api/archives/2026.zip')
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const url = <Msg = never>(href: string): Cmd<Msg> =>
  Stream.fromEffectDrain(
    Effect.sync(() => {
      if (typeof document !== 'undefined') click(href, '')
    })
  )

/**
 * Sends a request and saves the file it answers with.
 *
 * The file never reaches a message: `onSuccess` gets only its name, so the model
 * and every message stay small and serialisable. A failed request saves
 * nothing and ends in `onError`, exactly as with `Http.send`.
 *
 * The request is usually `Http.expectFile`, but any `Request<File>` works - a JSON
 * response decoded into a `File`, for instance.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 * import * as Http from 'tea-effect/Http'
 *
 * type Msg =
 *   | { readonly type: 'Exported'; readonly name: string }
 *   | { readonly type: 'ExportFailed'; readonly error: Http.HttpError }
 *
 * const exportUsers = File.Download.send(Http.get('/api/users/export', Http.expectFile), {
 *   onSuccess: (name): Msg => ({ type: 'Exported', name }),
 *   onError: (error): Msg => ({ type: 'ExportFailed', error })
 * })
 * ```
 *
 * @since 0.10.0
 * @category Commands
 */
export const send = <Msg>(
  req: Http.Request<File>,
  handlers: {
    readonly onSuccess: (name: string) => Msg
    readonly onError: (error: Http.HttpError) => Msg
  }
): Cmd<Msg, never, Http.HttpRequirements> =>
  Stream.fromEffect(
    Http.toTask(req).pipe(
      Effect.tap(save),
      Effect.match({
        onSuccess: (received) => handlers.onSuccess(received.name),
        onFailure: (error) => handlers.onError(error)
      })
    )
  )
