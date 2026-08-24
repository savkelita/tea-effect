import { Effect } from 'effect'
import { createRoot } from 'react-dom/client'
import * as TeaReact from 'tea-effect/React'
import * as Counter from './Counter'

const root = createRoot(document.getElementById('app')!)

Effect.runPromise(
  TeaReact.run(TeaReact.program(Counter.init, Counter.update, Counter.view), (dom) =>
    root.render(dom)
  )
)
