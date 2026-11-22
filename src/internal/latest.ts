import { Effect, Stream, pipe } from 'effect'
import type { Cmd } from '../Cmd'

// One start of a command under a key (Cmd.latest). The program remembers the latest run
// of each key; a message whose run is no longer that one is dropped instead of reaching
// `update`.
export class Run {
  constructor(readonly key: string) {}
}

// A message of a run, as it waits in the queue.
export class RunMsg<Msg> {
  constructor(
    readonly run: Run,
    readonly msg: Msg
  ) {}
}

// Put in the queue when a run ends, after its last message, however it ends: completed,
// failed or interrupted. Once it comes out, no message of the run is left waiting, and
// the program can forget the run.
export class RunEnd {
  constructor(readonly run: Run) {}
}

// What waits in the queue: a message, or what a run under a key put there.
export type Item<Msg> = Msg | RunMsg<Msg> | RunEnd

// Runs the command of a run: every message goes out tagged with the run, and the end goes
// out last on every exit, so the program forgets the run after a failure or an
// interruption too. A run replaced by a newer one under its key posts its end as well;
// the program drops it, as it drops the run's messages.
export const runToEnd = <Msg, E, R>(
  run: Run,
  cmd: Cmd<Msg, E, R>,
  offer: (item: RunMsg<Msg> | RunEnd) => Effect.Effect<unknown>
): Effect.Effect<void, E, R> =>
  pipe(
    cmd,
    Stream.runForEach((msg) => offer(new RunMsg(run, msg))),
    Effect.ensuring(offer(new RunEnd(run)))
  )
