/**
 * File module works with files: the ones the user picks and the ones the
 * application saves.
 *
 * Inspired by [Elm's elm/file](https://package.elm-lang.org/packages/elm/file/latest/).
 *
 * - `File.Select` asks the user for files;
 * - `File.Download` saves files on the user's device;
 * - the functions here read what a `File` holds.
 *
 * A file that a server sends arrives through `Http.expectFile`.
 *
 * @example
 * ```ts
 * import { pipe } from 'effect'
 * import * as File from 'tea-effect/File'
 * import * as Task from 'tea-effect/Task'
 *
 * type Msg =
 *   | { readonly type: 'CsvSelected'; readonly file: File.File }
 *   | { readonly type: 'CsvRead'; readonly text: string }
 *   | { readonly type: 'CsvUnreadable'; readonly error: File.ReadError }
 *
 * // When the user clicks "Import": open the picker.
 * const chooseCsv = File.Select.file(['text/csv', '.csv'], (file): Msg => ({ type: 'CsvSelected', file }))
 *
 * // When the file arrives: read it.
 * const readCsv = (file: File.File) =>
 *   pipe(
 *     File.toText(file),
 *     Task.attemptWith({
 *       onSuccess: (text): Msg => ({ type: 'CsvRead', text }),
 *       onFailure: (error): Msg => ({ type: 'CsvUnreadable', error })
 *     })
 *   )
 * ```
 *
 * @since 0.10.0
 */
import { Effect } from 'effect'
import type { Task } from './Task'

/**
 * Asking the user for files.
 *
 * @since 0.10.0
 */
export * as Select from './File/Select'

/**
 * Saving files on the user's device.
 *
 * @since 0.10.0
 */
export * as Download from './File/Download'

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

/**
 * A file - the browser's own `File`, under the name this module gives it.
 *
 * @since 0.10.0
 * @category Model
 */
export type File = globalThis.File

/**
 * Reading a file failed - it was removed or changed on disk after the user
 * picked it, for example.
 *
 * @since 0.10.0
 * @category Model
 */
export interface ReadError {
  readonly _tag: 'ReadError'
  readonly error: unknown
}

/**
 * Creates a ReadError.
 *
 * @since 0.10.0
 * @category Errors
 */
export const readError = (error: unknown): ReadError => ({ _tag: 'ReadError', error })

// -------------------------------------------------------------------------------------
// reading
// -------------------------------------------------------------------------------------

/**
 * Reads a file as UTF-8 text.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * const csv = (file: File.File) => File.toText(file)
 * // Task<string, File.ReadError>
 * ```
 *
 * @since 0.10.0
 * @category Reading
 */
export const toText = (file: File): Task<string, ReadError> =>
  Effect.tryPromise({ try: () => file.text(), catch: readError })

/**
 * Reads a file as bytes.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * const contents = (file: File.File) => File.toBytes(file)
 * // Task<Uint8Array<ArrayBuffer>, File.ReadError>
 * ```
 *
 * @since 0.10.0
 * @category Reading
 */
export const toBytes = (file: File): Task<Uint8Array<ArrayBuffer>, ReadError> =>
  Effect.tryPromise({ try: () => file.arrayBuffer(), catch: readError }).pipe(Effect.map((buffer) => new Uint8Array(buffer)))

/**
 * Reads a file as a `data:` URL - for an `<img src>` preview, for example.
 *
 * Interrupting the task aborts the read.
 *
 * @example
 * ```ts
 * import * as File from 'tea-effect/File'
 *
 * const preview = (photo: File.File) => File.toDataUrl(photo)
 * // Task<string, File.ReadError> - "data:image/png;base64,..."
 * ```
 *
 * @since 0.10.0
 * @category Reading
 */
export const toDataUrl = (file: File): Task<string, ReadError> =>
  Effect.callback<string, ReadError>((resume) => {
    const reader = new FileReader()
    reader.onload = () =>
      resume(typeof reader.result === 'string' ? Effect.succeed(reader.result) : Effect.fail(readError(reader.result)))
    reader.onerror = () => resume(Effect.fail(readError(reader.error)))
    reader.readAsDataURL(file)
    return Effect.sync(() => reader.abort())
  })
