import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Effect, Fiber, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import * as File from '../src/File'
import * as Http from '../src/Http'

const fakeLink = () => ({
  href: '',
  download: '',
  target: '',
  rel: '',
  origin: 'http://app',
  style: { display: '' },
  click: vi.fn(),
  remove: vi.fn()
})

// A stand-in for <input type="file">. A test plays the user through `click`:
// picking files fires `change`, closing the picker fires `cancel`.
const fakeInput = () => {
  const listeners = new Map<string, () => void>()
  return {
    type: '',
    accept: '',
    multiple: false,
    style: { display: '' },
    files: null as ReadonlyArray<File.File> | null,
    listeners,
    addEventListener: vi.fn((event: string, listener: () => void) => void listeners.set(event, listener)),
    removeEventListener: vi.fn((event: string) => void listeners.delete(event)),
    click: vi.fn(),
    remove: vi.fn()
  }
}

describe('File', () => {
  const origFetch = globalThis.fetch
  const csv = new globalThis.File(['id,naziv\n'], 'platforme.csv', { type: 'text/csv' })
  let link: ReturnType<typeof fakeLink>
  let input: ReturnType<typeof fakeInput>
  let append: ReturnType<typeof vi.fn>

  beforeEach(() => {
    link = fakeLink()
    input = fakeInput()
    append = vi.fn()
    ;(globalThis as any).document = {
      createElement: vi.fn((tag: string) => (tag === 'a' ? link : input)),
      body: { append }
    }
    ;(globalThis as any).location = { origin: 'http://app' }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    delete (globalThis as any).document
    delete (globalThis as any).location
    delete (globalThis as any).FileReader
    globalThis.fetch = origFetch
    vi.restoreAllMocks()
  })

  // Sleeps run on the TestClock, so the 40-second revoke never waits for real time.
  const run = <A>(cmd: Stream.Stream<A>) => Effect.runPromise(Effect.provide(Stream.runCollect(cmd), TestClock.layer()))

  const saved = (): File.File => vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as File.File

  describe('Download', () => {
    it('file saves through a hidden link named after the file, and produces no message', async () => {
      expect(await run(File.Download.file(csv))).toEqual([])
      expect(saved()).toBe(csv)
      expect(link.href).toBe('blob:file')
      expect(link.download).toBe('platforme.csv')
      expect(link.style.display).toBe('none')
      expect(link.target).toBe('')
      expect(append).toHaveBeenCalledWith(link)
      expect(link.click).toHaveBeenCalledTimes(1)
      expect(link.remove).toHaveBeenCalledTimes(1)
    })

    it('revokes the object URL only once the download had time to start', () =>
      Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            yield* Stream.runDrain(File.Download.file(csv))
            yield* TestClock.adjust('39 seconds')
            expect(URL.revokeObjectURL).not.toHaveBeenCalled()
            yield* TestClock.adjust('1 second')
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file')
          }),
          TestClock.layer()
        )
      ))

    it('text saves content under the given name and type', async () => {
      await run(File.Download.text('platforme.csv', 'text/csv', 'id,naziv\n'))
      expect(saved().name).toBe('platforme.csv')
      expect(saved().type).toBe('text/csv')
      expect(await saved().text()).toBe('id,naziv\n')
      expect(link.download).toBe('platforme.csv')
    })

    it('bytes saves content under the given name and type', async () => {
      await run(File.Download.bytes('izveštaj.pdf', 'application/pdf', new Uint8Array([37, 80, 68, 70])))
      expect(saved().name).toBe('izveštaj.pdf')
      expect(saved().type).toBe('application/pdf')
      expect(await saved().text()).toBe('%PDF')
    })

    it('url lets the browser download a same-origin link itself', async () => {
      expect(await run(File.Download.url('/api/archives/2026.zip'))).toEqual([])
      expect(link.href).toBe('/api/archives/2026.zip')
      expect(link.download).toBe('')
      expect(link.target).toBe('')
      expect(link.click).toHaveBeenCalledTimes(1)
      expect(URL.createObjectURL).not.toHaveBeenCalled()
    })

    it('url opens a link on another origin in a new tab', async () => {
      link.origin = 'https://cdn.example'
      await run(File.Download.url('https://cdn.example/2026.zip'))
      expect(link.target).toBe('_blank')
      expect(link.rel).toBe('noopener')
    })

    it('does nothing without a document', async () => {
      delete (globalThis as any).document
      expect(await run(File.Download.file(csv))).toEqual([])
      expect(await run(File.Download.url('/api/archives/2026.zip'))).toEqual([])
      expect(URL.createObjectURL).not.toHaveBeenCalled()
    })

    describe('send', () => {
      type Msg =
        | { readonly type: 'Exported'; readonly name: string }
        | { readonly type: 'ExportFailed'; readonly error: Http.HttpError }

      const handlers = {
        onSuccess: (name: string): Msg => ({ type: 'Exported', name }),
        onError: (error: Http.HttpError): Msg => ({ type: 'ExportFailed', error })
      }

      it('saves the file the request answers with and reports only its name', async () => {
        globalThis.fetch = (async () =>
          new Response('xlsx', {
            headers: { 'content-disposition': `attachment; filename*=UTF-8''platforme.xlsx` }
          })) as typeof fetch

        const msgs = await run(File.Download.send(Http.get('http://x/api/izvoz', Http.expectFile), handlers))

        expect(msgs).toEqual([{ type: 'Exported', name: 'platforme.xlsx' }])
        expect(link.download).toBe('platforme.xlsx')
        expect(link.click).toHaveBeenCalledTimes(1)
      })

      it('saves nothing when the request fails, and ends in onError', async () => {
        globalThis.fetch = (async () => new Response('[]', { status: 400 })) as typeof fetch

        const msgs = await run(File.Download.send(Http.get('http://x/api/izvoz', Http.expectFile), handlers))

        expect(msgs).toEqual([{ type: 'ExportFailed', error: Http.badStatus(400, '[]') }])
        expect(URL.createObjectURL).not.toHaveBeenCalled()
      })
    })
  })

  describe('Select', () => {
    const second = new globalThis.File(['id\n'], 'modeli.csv', { type: 'text/csv' })

    const choose = (picked: ReadonlyArray<File.File>) =>
      input.click.mockImplementation(() => {
        input.files = picked
        input.listeners.get('change')?.()
      })

    const dismiss = () => input.click.mockImplementation(() => input.listeners.get('cancel')?.())

    it('file opens the picker for the accepted types and sends the chosen file', async () => {
      choose([csv])
      const msgs = await run(File.Select.file(['text/csv', '.csv'], (file) => ({ type: 'Selected', file })))
      expect(msgs).toEqual([{ type: 'Selected', file: csv }])
      expect(input.type).toBe('file')
      expect(input.accept).toBe('text/csv,.csv')
      expect(input.multiple).toBe(false)
      expect(append).toHaveBeenCalledWith(input)
    })

    it('takes the input out of the document once the user has chosen', async () => {
      choose([csv])
      await run(File.Select.file([], (file) => file.name))
      expect(input.remove).toHaveBeenCalled()
      expect(input.listeners.size).toBe(0)
    })

    it('dismissing the picker sends no message', async () => {
      dismiss()
      expect(await run(File.Select.file([], (file) => file.name))).toEqual([])
      expect(input.remove).toHaveBeenCalled()
    })

    it('files allows several and sends them in one message', async () => {
      choose([csv, second])
      const msgs = await run(File.Select.files(['.csv'], (files) => files.map((file) => file.name)))
      expect(msgs).toEqual([['platforme.csv', 'modeli.csv']])
      expect(input.multiple).toBe(true)
    })

    it('files sends no message when the picker is dismissed', async () => {
      dismiss()
      expect(await run(File.Select.files([], (files) => files.length))).toEqual([])
    })

    it('does nothing without a document', async () => {
      delete (globalThis as any).document
      expect(await run(File.Select.file([], (file) => file.name))).toEqual([])
    })
  })

  describe('reading', () => {
    it('toText reads the file as text', async () => {
      expect(await Effect.runPromise(File.toText(csv))).toBe('id,naziv\n')
    })

    it('toBytes reads the file as bytes', async () => {
      expect(await Effect.runPromise(File.toBytes(csv))).toEqual(new TextEncoder().encode('id,naziv\n'))
    })

    it('a file that cannot be read is a ReadError', async () => {
      const gone = new Error('NotReadableError')
      const broken = { text: () => Promise.reject(gone) } as unknown as File.File
      expect(await Effect.runPromise(Effect.flip(File.toText(broken)))).toEqual(File.readError(gone))
    })

    // Node has no FileReader; this one answers on the next microtask, as the browser's does asynchronously.
    class FakeReader {
      static last: FakeReader | undefined
      static fail: unknown = undefined
      static hang = false
      result: string | null = null
      error: unknown = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      aborted = false
      constructor() {
        FakeReader.last = this
      }
      readAsDataURL(file: File.File): void {
        if (FakeReader.hang) return
        queueMicrotask(() => {
          if (FakeReader.fail !== undefined) {
            this.error = FakeReader.fail
            this.onerror?.()
          } else {
            this.result = `data:${file.type};base64,aWQ=`
            this.onload?.()
          }
        })
      }
      abort(): void {
        this.aborted = true
      }
    }

    beforeEach(() => {
      Object.assign(FakeReader, { last: undefined, fail: undefined, hang: false })
      ;(globalThis as any).FileReader = FakeReader
    })

    it('toDataUrl reads the file as a data: URL', async () => {
      expect(await Effect.runPromise(File.toDataUrl(csv))).toBe('data:text/csv;base64,aWQ=')
    })

    it('toDataUrl fails with a ReadError when the reader does', async () => {
      FakeReader.fail = new Error('denied')
      expect(await Effect.runPromise(Effect.flip(File.toDataUrl(csv)))).toEqual(File.readError(FakeReader.fail))
    })

    it('interrupting toDataUrl aborts the read', async () => {
      FakeReader.hang = true
      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(File.toDataUrl(csv))
          yield* Effect.yieldNow
          yield* Fiber.interrupt(fiber)
        })
      )
      expect(FakeReader.last?.aborted).toBe(true)
    })
  })
})
