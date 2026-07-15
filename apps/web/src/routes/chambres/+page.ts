import { redirect } from '@sveltejs/kit';

export const prerender = true;

export async function load() {
	throw redirect(301, '/le-site#chambres');
}
