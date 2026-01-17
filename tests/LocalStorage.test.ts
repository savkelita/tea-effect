import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Effect, Option, Schema, Stream, Chunk } from 'effect'
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

// Helper to run a Cmd and get the single message
const runCmd = async <Msg>(cmd: Stream.Stream<Msg>): Promise<Msg> => {
  const result = await Effect.runPromise(Stream.runCollect(cmd))
  const messages = Chunk.toArray(result)
  if (messages.length !== 1) {
    throw new Error(`Expected 1 message, got ${messages.length}`)
  }
  return messages[0]
}

// Message types for tests
type GetMsg<A> =
  | { readonly type: 'Got'; readonly result: Option.Option<A> }
  | { readonly type: 'Error'; readonly error: LocalStorage.LocalStorageError }

type SetMsg =
  | { readonly type: 'Saved' }
  | { readonly type: 'Error'; readonly error: LocalStorage.LocalStorageError }

type RemoveMsg =
  | { readonly type: 'Removed' }
  | { readonly type: 'Error'; readonly error: LocalStorage.LocalStorageError }

type ClearMsg =
  | { readonly type: 'Cleared' }
  | { readonly type: 'Error'; readonly error: LocalStorage.LocalStorageError }

type KeysMsg =
  | { readonly type: 'Keys'; readonly keys: ReadonlyArray<string> }
  | { readonly type: 'Error'; readonly error: LocalStorage.LocalStorageError }

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

    type User = typeof UserSchema.Type

    it('should return none when key does not exist', async () => {
      const cmd = LocalStorage.get<User, typeof UserSchema.Encoded, GetMsg<User>>('nonexistent', UserSchema, {
        onSuccess: (result): GetMsg<User> => ({ type: 'Got', result }),
        onError: (error): GetMsg<User> => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Got')
      if (msg.type === 'Got') {
        expect(Option.isNone(msg.result)).toBe(true)
      }
    })

    it('should decode and return value when key exists', async () => {
      const user = { id: '1', name: 'John' }
      mockStorage.setItem('user', JSON.stringify(user))

      const cmd = LocalStorage.get<User, typeof UserSchema.Encoded, GetMsg<User>>('user', UserSchema, {
        onSuccess: (result): GetMsg<User> => ({ type: 'Got', result }),
        onError: (error): GetMsg<User> => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Got')
      if (msg.type === 'Got') {
        expect(Option.isSome(msg.result)).toBe(true)
        if (Option.isSome(msg.result)) {
          expect(msg.result.value).toEqual(user)
        }
      }
    })

    it('should return error when value does not match schema', async () => {
      mockStorage.setItem('user', JSON.stringify({ invalid: 'data' }))

      const cmd = LocalStorage.get<User, typeof UserSchema.Encoded, GetMsg<User>>('user', UserSchema, {
        onSuccess: (result): GetMsg<User> => ({ type: 'Got', result }),
        onError: (error): GetMsg<User> => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Error')
      if (msg.type === 'Error') {
        expect(msg.error._tag).toBe('DecodeError')
      }
    })

    it('should return error when value is invalid JSON', async () => {
      mockStorage.setItem('user', 'not valid json')

      const cmd = LocalStorage.get<User, typeof UserSchema.Encoded, GetMsg<User>>('user', UserSchema, {
        onSuccess: (result): GetMsg<User> => ({ type: 'Got', result }),
        onError: (error): GetMsg<User> => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Error')
      if (msg.type === 'Error') {
        expect(msg.error._tag).toBe('JsonParseError')
      }
    })
  })

  describe('set', () => {
    const UserSchema = Schema.Struct({
      id: Schema.String,
      name: Schema.String
    })

    type User = typeof UserSchema.Type

    it('should encode and store value', async () => {
      const user = { id: '1', name: 'John' }
      const cmd = LocalStorage.set<User, typeof UserSchema.Encoded, SetMsg>('user', UserSchema, user, {
        onSuccess: (): SetMsg => ({ type: 'Saved' }),
        onError: (error): SetMsg => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Saved')
      expect(mockStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user))
    })

    it('should return error when value does not match schema', async () => {
      const InvalidSchema = Schema.Struct({
        id: Schema.Number
      })

      // @ts-expect-error - intentionally passing wrong type
      const cmd = LocalStorage.set('test', InvalidSchema, { id: 'not a number' }, {
        onSuccess: (): SetMsg => ({ type: 'Saved' }),
        onError: (error): SetMsg => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Error')
      if (msg.type === 'Error') {
        expect(msg.error._tag).toBe('EncodeError')
      }
    })
  })

  describe('setIgnoreErrors', () => {
    const UserSchema = Schema.Struct({
      id: Schema.String,
      name: Schema.String
    })

    it('should store value without producing message', async () => {
      const user = { id: '1', name: 'John' }
      const cmd = LocalStorage.setIgnoreErrors('user', UserSchema, user)
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)

      expect(messages).toEqual([])
      expect(mockStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user))
    })
  })

  describe('remove', () => {
    it('should remove item from storage', async () => {
      mockStorage.setItem('key', 'value')

      const cmd = LocalStorage.remove<RemoveMsg>('key', {
        onSuccess: (): RemoveMsg => ({ type: 'Removed' }),
        onError: (error): RemoveMsg => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Removed')
      expect(mockStorage.removeItem).toHaveBeenCalledWith('key')
    })
  })

  describe('removeIgnoreErrors', () => {
    it('should remove item without producing message', async () => {
      mockStorage.setItem('key', 'value')

      const cmd = LocalStorage.removeIgnoreErrors('key')
      const result = await Effect.runPromise(Stream.runCollect(cmd))
      const messages = Chunk.toArray(result)

      expect(messages).toEqual([])
      expect(mockStorage.removeItem).toHaveBeenCalledWith('key')
    })
  })

  describe('clear', () => {
    it('should clear all items from storage', async () => {
      mockStorage.setItem('key1', 'value1')
      mockStorage.setItem('key2', 'value2')

      const cmd = LocalStorage.clear<ClearMsg>({
        onSuccess: (): ClearMsg => ({ type: 'Cleared' }),
        onError: (error): ClearMsg => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Cleared')
      expect(mockStorage.clear).toHaveBeenCalled()
    })
  })

  describe('keys', () => {
    it('should return all keys', async () => {
      mockStorage._setStore({ key1: 'value1', key2: 'value2', key3: 'value3' })

      const cmd = LocalStorage.keys<KeysMsg>({
        onSuccess: (keys): KeysMsg => ({ type: 'Keys', keys }),
        onError: (error): KeysMsg => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Keys')
      if (msg.type === 'Keys') {
        expect(msg.keys).toEqual(['key1', 'key2', 'key3'])
      }
    })

    it('should return empty array when storage is empty', async () => {
      const cmd = LocalStorage.keys<KeysMsg>({
        onSuccess: (keys): KeysMsg => ({ type: 'Keys', keys }),
        onError: (error): KeysMsg => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Keys')
      if (msg.type === 'Keys') {
        expect(msg.keys).toEqual([])
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
    it('should return error when localStorage is not available', async () => {
      // @ts-expect-error - simulating no localStorage
      delete global.window

      const UserSchema = Schema.Struct({ id: Schema.String })
      type User = typeof UserSchema.Type

      const cmd = LocalStorage.get<User, typeof UserSchema.Encoded, GetMsg<User>>('key', UserSchema, {
        onSuccess: (result): GetMsg<User> => ({ type: 'Got', result }),
        onError: (error): GetMsg<User> => ({ type: 'Error', error })
      })
      const msg = await runCmd(cmd)

      expect(msg.type).toBe('Error')
      if (msg.type === 'Error') {
        expect(msg.error._tag).toBe('StorageNotAvailable')
      }
    })
  })

  describe('tasks', () => {
    const UserSchema = Schema.Struct({
      id: Schema.String,
      name: Schema.String
    })

    it('getTask should work directly', async () => {
      const user = { id: '1', name: 'John' }
      mockStorage.setItem('user', JSON.stringify(user))

      const result = await Effect.runPromise(LocalStorage.getTask('user', UserSchema))
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toEqual(user)
      }
    })

    it('setTask should work directly', async () => {
      const user = { id: '1', name: 'John' }
      await Effect.runPromise(LocalStorage.setTask('user', UserSchema, user))
      expect(mockStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user))
    })

    it('removeTask should work directly', async () => {
      mockStorage.setItem('key', 'value')
      await Effect.runPromise(LocalStorage.removeTask('key'))
      expect(mockStorage.removeItem).toHaveBeenCalledWith('key')
    })

    it('clearTask should work directly', async () => {
      mockStorage.setItem('key', 'value')
      await Effect.runPromise(LocalStorage.clearTask)
      expect(mockStorage.clear).toHaveBeenCalled()
    })

    it('keysTask should work directly', async () => {
      mockStorage._setStore({ a: '1', b: '2' })
      const result = await Effect.runPromise(LocalStorage.keysTask)
      expect(result).toEqual(['a', 'b'])
    })
  })
})
