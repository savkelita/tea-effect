import { describe, it, expect } from 'vitest'
import * as Html from '../src/Html'
import type { Dispatch } from '../src/Platform'

type Parent = { readonly _tag: 'Child'; readonly n: number }

const child = (n: number): Parent => ({ _tag: 'Child', n })

/** A view that records every dispatch it is handed, so identity can be asserted. */
const recorder = () => {
  const seen: Array<Dispatch<number>> = []
  const html: Html.Html<string, number> = (dispatch) => {
    seen.push(dispatch)
    return 'dom'
  }
  return { html, seen }
}

describe('Html', () => {
  describe('map', () => {
    it('should forward mapped messages to the parent dispatch', () => {
      const { html, seen } = recorder()
      const received: Array<Parent> = []
      const parent: Dispatch<Parent> = (msg) => void received.push(msg)

      Html.map(child)(html)(parent)
      seen[0]!(7)

      expect(received).toEqual([child(7)])
    })

    // The real render loop rebuilds the whole `map(f)(html)` chain every time, so caching
    // inside a single `map` call would not help. This is the regression guard.
    it('should hand the child the same dispatch across rebuilt chains', () => {
      const { html, seen } = recorder()
      const parent: Dispatch<Parent> = () => {}

      Html.map(child)(html)(parent)
      Html.map(child)(html)(parent)

      expect(seen).toHaveLength(2)
      expect(seen[0]).toBe(seen[1])
    })

    it('should still dispatch correctly through a cached mapping', () => {
      const { html, seen } = recorder()
      const received: Array<Parent> = []
      const parent: Dispatch<Parent> = (msg) => void received.push(msg)

      Html.map(child)(html)(parent)
      Html.map(child)(html)(parent)
      seen[1]!(1)
      seen[0]!(2)

      expect(received).toEqual([child(1), child(2)])
    })

    it('should give a different dispatch to a different parent', () => {
      const { html, seen } = recorder()

      Html.map(child)(html)(() => {})
      Html.map(child)(html)(() => {})

      expect(seen[0]).not.toBe(seen[1])
    })

    it('should give a different dispatch for a different mapper', () => {
      const { html, seen } = recorder()
      const parent: Dispatch<Parent> = () => {}
      const other = (n: number): Parent => ({ _tag: 'Child', n: n * 2 })

      Html.map(child)(html)(parent)
      Html.map(other)(html)(parent)

      expect(seen[0]).not.toBe(seen[1])
    })

    // Documented limitation: the cache is keyed on `f`, so an inline mapper is a new key
    // every render. It stays correct, it just stops being stable.
    it('should not be able to cache an inline mapper', () => {
      const { html, seen } = recorder()
      const parent: Dispatch<Parent> = () => {}

      Html.map((n: number) => child(n))(html)(parent)
      Html.map((n: number) => child(n))(html)(parent)

      expect(seen[0]).not.toBe(seen[1])
    })

    // A screen usually sits behind two boundaries: root -> screen -> page. The second level
    // is only stable because the first one is, so the whole chain has to be exercised.
    it('should stay stable through composed boundaries', () => {
      const { html, seen } = recorder()
      const root: Dispatch<{ readonly _tag: 'Screen'; readonly msg: Parent }> = () => {}
      const screen = (msg: Parent) => ({ _tag: 'Screen' as const, msg })

      Html.map(screen)(Html.map(child)(html))(root)
      Html.map(screen)(Html.map(child)(html))(root)

      expect(seen[0]).toBe(seen[1])
    })

    it('should leave the dom untouched', () => {
      const { html } = recorder()
      expect(Html.map(child)(html)(() => {})).toBe('dom')
    })
  })
})
