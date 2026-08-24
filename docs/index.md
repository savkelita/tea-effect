---
layout: home

hero:
  name: tea-effect
  text: The Elm Architecture for TypeScript
  tagline: One state, one update function, side effects as values - powered by Effect.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: Why tea-effect?
      link: /guide/why
    - theme: alt
      text: GitHub
      link: https://github.com/savkelita/tea-effect

features:
  - title: One loop, no surprises
    details: All application state lives in a single Model. The only way it changes is a Msg going through one update function. There is no second path.
  - title: Side effects are values
    details: update never performs a fetch or starts a timer. It returns a Cmd or a Sub describing what should happen. That keeps update a pure function you can call in a test.
  - title: Errors and dependencies in the type
    details: Commands and subscriptions carry Effect's E and R parameters. What can fail, and what it needs to run, is visible in the signature - not discovered in production.
  - title: Renderer-agnostic core
    details: The runtime knows nothing about React. React bindings ship in the box; the Html core is generic over the element type it produces.
---
