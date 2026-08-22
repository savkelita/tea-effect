/**
 * tea-effect - The Elm Architecture for TypeScript with Effect
 *
 * This entry re-exports every module. Note that it therefore pulls in `Http`,
 * which imports `@effect/platform`. Import the subpath instead - `tea-effect/Cmd`,
 * `tea-effect/Sub`, and so on - to keep that dependency out of your graph.
 *
 * @since 0.1.0
 */

/**
 * Commands: descriptions of side effects that produce messages.
 *
 * @since 0.1.0
 */
export * as Cmd from "./Cmd";

/**
 * Subscriptions: ongoing sources of messages, declared per model.
 *
 * @since 0.1.0
 */
export * as Sub from "./Sub";

/**
 * Tasks: an alias for Effect, plus the conversions into `Cmd`.
 *
 * @since 0.1.0
 */
export * as Task from "./Task";

/**
 * The core TEA runtime, without any rendering.
 *
 * @since 0.1.0
 */
export * as Platform from "./Platform";

/**
 * Programs that render a view, generic over the element type produced.
 *
 * @since 0.1.0
 */
export * as Html from "./Html";

/**
 * React bindings: programs, `run`, and the `useProgram` hook factory.
 *
 * @since 0.1.0
 */
export * as React from "./React";

/**
 * HTTP requests with Schema validation and Elm-style errors.
 *
 * @since 0.2.0
 */
export * as Http from "./Http";

/**
 * Browser storage with Schema encoding and cross-tab change events.
 *
 * @since 0.3.0
 */
export * as LocalStorage from "./LocalStorage";

/**
 * Browser history and URL management.
 *
 * @since 0.5.0
 */
export * as Navigation from "./Navigation";

/**
 * Type-safe, bidirectional URL routing with Schema validation.
 *
 * @since 0.6.0
 */
export * as Router from "./Router";
