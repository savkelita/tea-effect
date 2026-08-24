import * as React from 'react'
import { makeUseProgram } from 'tea-effect/React'
import * as Counter from './Counter'

// Create the hook once, at module level - not inside the component.
const useProgram = makeUseProgram(React)

export const CounterComponent = () => {
  const { model, dispatch } = useProgram(Counter.init, Counter.update)

  return (
    <div>
      <button onClick={() => dispatch({ type: 'Decrement' })}>-</button>
      <span>{model.count}</span>
      <button onClick={() => dispatch({ type: 'Increment' })}>+</button>
    </div>
  )
}
