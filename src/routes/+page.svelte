<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Menu from '@lucide/svelte/icons/menu';
	import FileText from '@lucide/svelte/icons/file-text';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import {
		thesis,
		mainChapters,
		appendices,
		navEntries,
		navById,
		pdfPage,
		BIBLIOGRAPHY_ID,
		type Chapter
	} from '#lib/content/index.js';
	import { ScrollSpy } from '#lib/scrollspy.svelte.js';
	import Hero from '#lib/components/thesis/Hero.svelte';
	import TableOfContents from '#lib/components/thesis/TableOfContents.svelte';
	import PdfViewer from '#lib/components/thesis/PdfViewer.svelte';
	import LinkPreview from '#lib/components/thesis/LinkPreview.svelte';
	import FigureLightbox from '#lib/components/thesis/FigureLightbox.svelte';
	import ThemeToggle from '#lib/components/thesis/ThemeToggle.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * In the browser `data.body` is null; a non-empty placeholder makes Svelte
	 * adopt the prerendered HTML for each {@html} block instead of clearing it.
	 */
	const html = (id: string) => data.body?.[id] ?? ' ';

	const spy = new ScrollSpy(navEntries.map((e) => e.id));
	const m = thesis.meta;

	let main: HTMLElement | undefined = $state();
	let tocOpen = $state(false);
	let pdfOpen = $state(false);
	let pdfAt = $state(1);
	let returnTo = $state<number | null>(null);

	const current = $derived(spy.active ? navById.get(spy.active) : null);
	const currentChapter = $derived.by(() => {
		let e = current;
		while (e?.parent) e = navById.get(e.parent);
		return e;
	});

	function openPdf(page = 1) {
		pdfAt = page;
		pdfOpen = true;
	}

	/** PDF page for whatever the reader is looking at right now. */
	function currentPdfPage() {
		let e = current;
		while (e && !e.page) e = e.parent ? navById.get(e.parent) : undefined;
		return e?.page ? pdfPage(e.page) : 1;
	}

	onMount(() => {
		if (!main) return;
		const detach = spy.attach(main);

		// In-text jumps (citations, cross-references, footnotes) offer a way back.
		const click = (e: MouseEvent) => {
			const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
			if (!a || !main?.contains(a) || a.closest('#' + BIBLIOGRAPHY_ID)) return;
			if (a.matches('.cite, .xref, .footnote-ref, .footnote-back')) {
				returnTo = window.scrollY;
				leftOrigin = false;
			}
			const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
			if (target) {
				target.classList.remove('flash');
				void target.offsetWidth;
				target.classList.add('flash');
			}
		};
		main.addEventListener('click', click);
		return () => {
			detach();
			main?.removeEventListener('click', click);
		};
	});

	async function goBack() {
		if (returnTo === null) return;
		const y = returnTo;
		returnTo = null;
		await tick();
		window.scrollTo({ top: y });
	}

	// Hide the "back" chip once the reader, having left, scrolls back near where they were.
	let leftOrigin = false;
	$effect(() => {
		spy.progress;
		if (returnTo === null) return void (leftOrigin = false);
		const distance = Math.abs(window.scrollY - returnTo);
		if (distance > 400) leftOrigin = true;
		else if (leftOrigin && distance < 200) returnTo = null;
	});

	const sizeMb = m.pdf.bytes ? (m.pdf.bytes / 1024 / 1024).toFixed(1) : null;
</script>

{#snippet chapterBlock(c: Chapter)}
	<article id={c.id} class="chapter scroll-mt-20" aria-labelledby="{c.id}-title">
		<header class="mx-auto max-w-[42rem] border-t pt-14 pb-4 sm:pt-20">
			<div class="flex items-center justify-between gap-4 font-sans">
				<p class="text-[0.72rem] font-semibold tracking-[0.16em] text-brand uppercase">
					{c.kind === 'appendix' ? 'Appendix' : `Chapter ${c.number}`}
				</p>
				{#if c.page}
					<button
						class="text-[0.75rem] text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => openPdf(pdfPage(c.page))}
					>
						PDF p. {c.page}
					</button>
				{/if}
			</div>
			<h2
				id="{c.id}-title"
				class="mt-3 text-[2.1rem] leading-tight font-bold tracking-[-0.01em] sm:text-[2.6rem]"
			>
				{c.title}
			</h2>
		</header>
		<div class="thesis">{@html html(c.id)}</div>
	</article>
{/snippet}

{#snippet frontBlock(id: string, title: string, extra?: import('svelte').Snippet)}
	<section {id} class="scroll-mt-20" aria-labelledby="{id}-title">
		<header class="mx-auto max-w-[42rem] border-t pt-14 pb-2 sm:pt-16">
			<h2 id="{id}-title" class="text-[1.75rem] leading-tight font-bold">{title}</h2>
		</header>
		<div class="thesis">{@html html(id)}</div>
		{@render extra?.()}
	</section>
{/snippet}

{#snippet keywords()}
	<div class="mx-auto mt-2 flex max-w-[42rem] flex-wrap gap-1.5 font-sans">
		{#each m.keywords as k (k)}
			<span class="rounded-full border bg-card px-2.5 py-0.5 text-[0.72rem] text-muted-foreground"
				>{k}</span
			>
		{/each}
	</div>
{/snippet}

<!-- Reading progress -->
<div class="no-print fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent" aria-hidden="true">
	<div class="h-full origin-left bg-brand" style:transform="scaleX({spy.progress})"></div>
</div>

<!-- Mobile top bar -->
<header
	class="mobile-bar sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 font-sans backdrop-blur-md lg:hidden"
>
	<Sheet.Root bind:open={tocOpen}>
		<Sheet.Trigger>
			{#snippet child({ props })}
				<Button variant="ghost" size="icon-sm" {...props}>
					<Menu />
					<span class="sr-only">Contents</span>
				</Button>
			{/snippet}
		</Sheet.Trigger>
		<Sheet.Content side="left" class="w-[86vw] max-w-sm gap-0 p-0">
			<Sheet.Header class="border-b py-4 pr-12 pl-5">
				<Sheet.Title class="font-serif text-base leading-snug">{m.title}</Sheet.Title>
				<Sheet.Description class="text-xs">{m.author} · {m.date}</Sheet.Description>
			</Sheet.Header>
			<div class="min-h-0 flex-1 px-2 pt-4">
				<TableOfContents active={spy.active} onnavigate={() => (tocOpen = false)} />
			</div>
		</Sheet.Content>
	</Sheet.Root>
	<div class="min-w-0 flex-1 leading-tight">
		{#if currentChapter}
			<p class="truncate text-[0.7rem] text-muted-foreground">
				{currentChapter.number ? `Chapter ${currentChapter.number}` : 'Thesis'}
			</p>
			<p class="truncate text-[0.82rem] font-medium">{current?.label}</p>
		{:else}
			<p class="truncate font-serif text-[0.95rem] font-bold">{m.author}</p>
		{/if}
	</div>
	<Button variant="ghost" size="icon-sm" onclick={() => openPdf(currentPdfPage())}>
		<FileText />
		<span class="sr-only">Open PDF</span>
	</Button>
	<ThemeToggle />
</header>

<div class="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]">
	<!-- Desktop sidebar -->
	<aside class="sticky top-0 hidden h-dvh flex-col border-r bg-background lg:flex">
		<div class="px-5 pt-6 pb-4">
			<a
				href="#top"
				class="block font-serif text-[0.95rem] leading-snug font-bold text-foreground hover:text-brand"
			>
				{m.title}
			</a>
			<p class="mt-1 font-sans text-xs text-muted-foreground">
				{m.author} · {m.department} · {m.date}
			</p>
		</div>
		<div class="min-h-0 flex-1 px-2">
			<TableOfContents active={spy.active} />
		</div>
		<div class="flex items-center gap-1 border-t px-3 py-2.5 font-sans">
			<Button
				variant="ghost"
				size="sm"
				class="flex-1 justify-start"
				onclick={() => openPdf(currentPdfPage())}
			>
				<FileText />
				Open PDF{current?.page || currentChapter?.page ? ' here' : ''}
			</Button>
			<ThemeToggle />
		</div>
	</aside>

	<main bind:this={main} id="top" class="min-w-0 px-5 pb-32 sm:px-8">
		<Hero onpdf={() => openPdf(1)} />

		{@render frontBlock('abstract', 'Abstract', keywords)}

		{#each mainChapters as c (c.id)}
			{@render chapterBlock(c)}
		{/each}

		<section id={BIBLIOGRAPHY_ID} class="scroll-mt-20" aria-labelledby="bibliography-title">
			<header class="mx-auto max-w-[42rem] border-t pt-14 pb-4 sm:pt-20">
				<p class="font-sans text-[0.72rem] font-semibold tracking-[0.16em] text-brand uppercase">
					{thesis.references.length} references
				</p>
				<h2
					id="bibliography-title"
					class="mt-3 text-[2.1rem] leading-tight font-bold sm:text-[2.6rem]"
				>
					Bibliography
				</h2>
			</header>
			<ol class="thesis references mx-auto max-w-[42rem] font-sans text-[0.86rem] leading-relaxed">
				{#each thesis.references as r (r.key)}
					<li
						id="ref-{r.key}"
						class="grid scroll-mt-24 grid-cols-[2.6rem_1fr] gap-x-2 rounded-md py-2"
					>
						<span class="text-right text-brand tabular-nums">[{r.n}]</span>
						<span class="reference">{@html r.html}</span>
					</li>
				{/each}
			</ol>
		</section>

		{#each appendices as c (c.id)}
			{@render chapterBlock(c)}
		{/each}

		{@render frontBlock('acknowledgements', 'Acknowledgements')}
		{@render frontBlock('ai-declaration', thesis.front[2].title)}

		<footer
			class="mx-auto mt-24 max-w-[42rem] border-t pt-8 font-sans text-xs leading-relaxed text-muted-foreground"
		>
			<p>
				{m.author}. <em class="font-serif text-[0.85rem]">{m.title}: {m.subtitle}.</em>
				{m.degree}, {m.department}, {m.institution}, {m.date}.
			</p>
			<p class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				<button
					class="underline underline-offset-2 hover:text-foreground"
					onclick={() => openPdf(1)}>View PDF</button
				>
				<a
					class="underline underline-offset-2 hover:text-foreground"
					href={m.pdf.src}
					download="Nygard-MSc-thesis-2026.pdf"
				>
					Download PDF{sizeMb ? ` (${sizeMb} MB)` : ''}
				</a>
				<a class="underline underline-offset-2 hover:text-foreground" href="#top">Back to top</a>
			</p>
		</footer>
	</main>
</div>

<!-- Floating actions -->
<div
	class="no-print fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2 font-sans sm:right-6 sm:bottom-6"
>
	{#if returnTo !== null}
		<button
			transition:fly={{ y: 8, duration: 160 }}
			onclick={goBack}
			class="flex items-center gap-2 rounded-full border bg-popover px-3.5 py-2 text-xs font-medium shadow-lg shadow-black/10 hover:bg-muted"
		>
			<Undo2 class="size-3.5" />
			Back to where you were
		</button>
	{/if}
	{#if spy.progress > 0.03}
		<a
			transition:fly={{ y: 8, duration: 160 }}
			href="#top"
			aria-label="Back to top"
			class="flex size-9 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow-md hover:text-foreground"
		>
			<ArrowUp class="size-4" />
		</a>
	{/if}
</div>

<LinkPreview root={main} />
<FigureLightbox root={main} />
<PdfViewer bind:open={pdfOpen} page={pdfAt} />
