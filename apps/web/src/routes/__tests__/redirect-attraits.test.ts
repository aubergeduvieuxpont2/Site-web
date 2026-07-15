import { describe, it, expect } from 'vitest';

describe('redirect-attraits route', () => {
	it('exports prerender = true', async () => {
		const { prerender } = await import('../attraits/+page');
		expect(prerender).toBe(true);
	});

	it('throws a 301 redirect to /le-site#attraits on load', async () => {
		const { load } = await import('../attraits/+page');
		try {
			await load();
			throw new Error('Expected load() to throw a redirect');
		} catch (e: any) {
			expect(e.status).toBe(301);
			expect(e.location).toBe('/le-site#attraits');
		}
	});
});
