import type { PageLoad } from './$types';

export const prerender = true;

/**
 * The thesis body (~550 KB of HTML) is only loaded while prerendering. In the
 * browser this returns null and the page keeps the server-rendered HTML, so the
 * text isn't shipped a second time inside the JavaScript bundle.
 */
export const load: PageLoad = async () => {
	if (import.meta.env.SSR) {
		const body: Record<string, string> = (await import('#lib/content/body.json')).default;
		return { body };
	}
	return { body: null };
};
