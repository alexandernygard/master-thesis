<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { thesis } from '#lib/content/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const m = thesis.meta;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{m.title} — {m.author}</title>
	<meta
		name="description"
		content="{m.subtitle}. {m.degree}, {m.department}, {m.institution}, {m.date}."
	/>
	<meta name="author" content={m.author} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={m.title} />
	<meta
		property="og:description"
		content="{m.subtitle}. {m.degree} by {m.author}, {m.department}, {m.date}."
	/>
	<meta name="citation_title" content={m.title} />
	<meta name="citation_author" content={m.author} />
	<meta name="citation_publication_date" content="2026/06" />
	<meta name="citation_dissertation_institution" content={m.institution} />
	<meta name="citation_pdf_url" content={m.pdf.src} />
</svelte:head>

<ModeWatcher />
{@render children()}
