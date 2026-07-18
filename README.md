# Reproduction: AstroSession Logger & #partial State Bug

This branch (`repro/session-logger-bug`) contains a minimal reproducible example for two unit-level bugs in the `AstroSession` runtime:

1. `console.error` bypassing the structured log sink during session regeneration.
2. `#partial` state flag not being reset on the `regenerate()` error path.

## The Bugs

In `packages/astro/src/core/session/runtime.ts`:

1. **Logging Bypass:** `regenerate()` and `PERSIST_SYMBOL` contain three `console.error` call-sites. Every other warning in the Astro pipeline routes through `pipeline.logger` (an `AstroLogger` instance). These three calls write directly to `process.stderr`, bypassing any custom log destination, log-level filtering, or structured log sinks that a user or adapter has configured.

2. **Inconsistent `#partial` State:** When `#ensureData()` throws during `regenerate()`, the catch block logs the error and continues with an empty `Map`. However, `#partial` is not set to `false`. After `regenerate()` assigns the new session ID and calls `#setCookie()`, the instance still has `#partial = true`. A subsequent call to `get()` triggers another `#ensureData()` call, which attempts to load data from the new (empty) session ID in storage, unnecessarily round-tripping to the driver.

## Steps to Reproduce

1. Clone the repository and check out this branch:
   ```bash
   git checkout repro/session-logger-bug
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run the targeted unit test:
   ```bash
   pnpm -C packages/astro exec astro-scripts test "test/units/sessions/regenerate-logger.test.ts"
   ```

## Expected Behavior

The test expects:
- Session diagnostics should be emitted through `AstroLogger` (`logger.warn()`) instead of `console.error()`.
- `regenerate()` should leave the session in a non-partial state (`#partial = false`) after recovering from an error, preventing unnecessary storage reads on subsequent `get()` calls.

## Actual Behavior

The test fails with two assertion errors on `main`:
1. `AssertionError: Should not use console.error, should use logger`
2. `AssertionError: Should not round-trip to storage; #partial should be false after regeneration` (An extra storage read occurs).
