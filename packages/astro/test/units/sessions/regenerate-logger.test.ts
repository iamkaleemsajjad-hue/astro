import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AstroSession } from '../../../src/core/session/runtime.js';
import type { SSRManifestSession } from '../../../src/core/app/types.js';
import type { SessionDriverFactory } from '../../../src/core/session/types.js';

describe('AstroSession - regenerate() error path', () => {
	it('should route errors to logger and reset #partial flag', async () => {
		let storageGetCount = 0;
		const mockStorage = {
			async get(key: string) {
				storageGetCount++;
				if (key === 'old-session') {
					// Return a string that unflatten() will parse into an Array, not a Map
					// This causes unflatten(raw) instanceof Map to be false, throwing an AstroError
					return '[1,2,3]';
				}
				return null;
			},
			async setItem() {},
			async removeItem() {},
			async getKeys() { return []; },
			async clear() {},
			async dispose() {},
			async hasItem() { return false; },
			async setItemRaw() {},
			async getItemRaw() { return null; },
			async getMeta() { return {}; },
			async watch() {},
			async unwatch() {},
		};

		let warnCalled = false;
		const mockLogger: any = {
			warn: () => {
				warnCalled = true;
			}
		};

		const cookies: any = {
			get: () => ({ value: 'old-session' }),
			set: () => {},
			delete: () => {},
		};

		const config: SSRManifestSession = {
			driver: 'memory',
			cookie: 'test-session',
		};

		// @ts-ignore - The logger argument doesn't exist on the main branch, so we ignore the TS error
		const session = new AstroSession({
			cookies,
			config,
			runtimeMode: 'production',
			driverFactory: (() => {}) as unknown as SessionDriverFactory,
			mockStorage: mockStorage as any,
			logger: mockLogger,
		});

		// Monkey-patch console.error to track if it's called
		let consoleErrorCalled = false;
		const originalConsoleError = console.error;
		console.error = () => {
			consoleErrorCalled = true;
		};

		try {
			// This will trigger ensureData() under the hood.
			// It fetches 'old-session' which returns invalid data, throwing an error.
			// regenerate() catches this, should log a warning, and reset #partial.
			await session.regenerate();

			// 1. Verify logging behavior
			assert.equal(consoleErrorCalled, false, 'Should not use console.error, should use logger');
			assert.equal(warnCalled, true, 'Should use logger.warn instead of console.error');

			// Reset storage count before checking get()
			storageGetCount = 0;

			// 2. Verify #partial state
			// If #partial is true, this will call storage.get() for the new session ID.
			// If #partial is correctly reset to false, this will use the in-memory Map.
			await session.get('foo');
			
			assert.equal(storageGetCount, 0, 'Should not round-trip to storage; #partial should be false after regeneration');
		} finally {
			console.error = originalConsoleError;
		}
	});
});
