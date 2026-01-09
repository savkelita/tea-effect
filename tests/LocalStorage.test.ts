import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Effect, Option, Schema } from 'effect'
import * as LocalStorage from '../src/LocalStorage'

// Mock localStorage
const createMockStorage = () => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length
    },
    _store: store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore
    }
  }
}

describe('LocalStorage', () => {
  let mockStorage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    mockStorage = createMockStorage()
    // @ts-expect-error - mocking global
    global.window = {
      localStorage: mockStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  })

  afterEach(() => {
    // @ts-expect-error - cleaning up mock
    delete global.window
  })

  describe('get', () => {
    const UserSchema = Schema.Struct({
      id: Schema.String,
      name: Schema.String
    })

    it('should return none when key does not exist', async () => {
      const cmd = LocalStorage.get('nonexistent', UserSchema, (result) => ({ type: 'Got', result }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toEqual({ type: 'Got', result: Option.none() })
      }
    })

    it('should decode and return value when key exists', async () => {
      const user = { id: '1', name: 'John' }
      mockStorage.setItem('user', JSON.stringify(user))

      const cmd = LocalStorage.get('user', UserSchema, (result) => ({ type: 'Got', result }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.type).toBe('Got')
        expect(Option.isSome(result.value.result)).toBe(true)
        if (Option.isSome(result.value.result)) {
          expect(result.value.result.value).toEqual(user)
        }
      }
    })

    it('should fail with DecodeError when value does not match schema', async () => {
      mockStorage.setItem('user', JSON.stringify({ invalid: 'data' }))

      const cmd = LocalStorage.get('user', UserSchema, (result) => ({ type: 'Got', result }))
      const result = await Effect.runPromiseExit(cmd)

      expect(result._tag).toBe('Failure')
    })

    it('should fail with DecodeError when value is invalid JSON', async () => {
      mockStorage.setItem('user', 'not valid json')

      const cmd = LocalStorage.get('user', UserSchema, (result) => ({ type: 'Got', result }))
      const result = await Effect.runPromiseExit(cmd)

      expect(result._tag).toBe('Failure')
    })
  })

  describe('getRaw', () => {
    it('should return none when key does not exist', async () => {
      const cmd = LocalStorage.getRaw('nonexistent', (result) => ({ type: 'Got', result }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toEqual({ type: 'Got', result: Option.none() })
      }
    })

    it('should return raw string when key exists', async () => {
      mockStorage.setItem('key', 'raw value')

      const cmd = LocalStorage.getRaw('key', (result) => ({ type: 'Got', result }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.type).toBe('Got')
        expect(Option.isSome(result.value.result)).toBe(true)
        if (Option.isSome(result.value.result)) {
          expect(result.value.result.value).toBe('raw value')
        }
      }
    })
  })

  describe('set', () => {
    const UserSchema = Schema.Struct({
      id: Schema.String,
      name: Schema.String
    })

    it('should encode and store value', async () => {
      const user = { id: '1', name: 'John' }
      const cmd = LocalStorage.set('user', UserSchema, user)
      const result = await Effect.runPromise(cmd)

      expect(result).toEqual(Option.none())
      expect(mockStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user))
    })

    it('should fail with EncodeError when value does not match schema', async () => {
      const InvalidSchema = Schema.Struct({
        id: Schema.Number
      })

      // @ts-expect-error - intentionally passing wrong type
      const cmd = LocalStorage.set('test', InvalidSchema, { id: 'not a number' })
      const result = await Effect.runPromiseExit(cmd)

      expect(result._tag).toBe('Failure')
    })
  })

  describe('setRaw', () => {
    it('should store raw string', async () => {
      const cmd = LocalStorage.setRaw('key', 'raw value')
      const result = await Effect.runPromise(cmd)

      expect(result).toEqual(Option.none())
      expect(mockStorage.setItem).toHaveBeenCalledWith('key', 'raw value')
    })
  })

  describe('remove', () => {
    it('should remove item from storage', async () => {
      mockStorage.setItem('key', 'value')

      const cmd = LocalStorage.remove('key')
      const result = await Effect.runPromise(cmd)

      expect(result).toEqual(Option.none())
      expect(mockStorage.removeItem).toHaveBeenCalledWith('key')
    })
  })

  describe('clear', () => {
    it('should clear all items from storage', async () => {
      mockStorage.setItem('key1', 'value1')
      mockStorage.setItem('key2', 'value2')

      const result = await Effect.runPromise(LocalStorage.clear)

      expect(result).toEqual(Option.none())
      expect(mockStorage.clear).toHaveBeenCalled()
    })
  })

  describe('keys', () => {
    it('should return all keys', async () => {
      mockStorage._setStore({ key1: 'value1', key2: 'value2', key3: 'value3' })

      const cmd = LocalStorage.keys((keys) => ({ type: 'Keys', keys }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.type).toBe('Keys')
        expect(result.value.keys).toEqual(['key1', 'key2', 'key3'])
      }
    })

    it('should return empty array when storage is empty', async () => {
      const cmd = LocalStorage.keys((keys) => ({ type: 'Keys', keys }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.keys).toEqual([])
      }
    })
  })

  describe('length', () => {
    it('should return number of items', async () => {
      mockStorage._setStore({ key1: 'value1', key2: 'value2' })

      const cmd = LocalStorage.length((len) => ({ type: 'Length', len }))
      const result = await Effect.runPromise(cmd)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toEqual({ type: 'Length', len: 2 })
      }
    })
  })

  describe('error types', () => {
    it('should create StorageNotAvailable error', () => {
      expect(LocalStorage.storageNotAvailable).toEqual({ _tag: 'StorageNotAvailable' })
    })

    it('should create QuotaExceeded error', () => {
      const error = LocalStorage.quotaExceeded('myKey')
      expect(error).toEqual({ _tag: 'QuotaExceeded', key: 'myKey' })
    })
  })

  describe('storage not available', () => {
    it('should fail when localStorage is not available', async () => {
      // @ts-expect-error - simulating no localStorage
      delete global.window

      const cmd = LocalStorage.getRaw('key', (r) => r)
      const result = await Effect.runPromiseExit(cmd)

      expect(result._tag).toBe('Failure')
    })
  })
})
