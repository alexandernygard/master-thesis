<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import { thesis } from '#lib/content/index.js';

	let { onpdf }: { onpdf: () => void } = $props();
	const m = thesis.meta;

	// Headline numbers, as reported in the abstract.
	const findings = [
		{ value: '39.3% → 91.7%', label: 'Task success, tool calling (H1) to programmatic (H2)' },
		{ value: '−66%', label: 'Mean total tokens, H1 to H2' },
		{ value: '−18.9%', label: 'Further token reduction with the agent-native module (H3)' }
	];
	const harnesses = [
		{ code: 'H1', name: 'Traditional tool calling' },
		{ code: 'H2', name: 'Programmatic tool calling' },
		{ code: 'H3', name: 'Agent-native domain module' }
	];
	// Optical sizes: the tall DTU mark, wide EU mark and square Ardoq mark read as one row.
	const logoHeight: Record<string, string> = {
		DTU: '2.6rem',
		'Co-funded by the European Union': '2.2rem',
		Ardoq: '2.35rem'
	};
</script>

<header class="relative px-5 pt-16 pb-14 sm:px-8 sm:pt-24 lg:pt-28">
	<div class="mx-auto max-w-[46rem]">
		<ul
			class="mb-12 flex flex-wrap items-center gap-x-8 gap-y-4 text-foreground/80 sm:mb-14"
			aria-label="Institutions"
		>
			{#each m.logos as logo (logo.name)}
				<li>
					<span
						role="img"
						aria-label={logo.name}
						title={logo.name}
						class="logo block"
						style:--logo="url({logo.src})"
						style:height={logoHeight[logo.name] ?? '2rem'}
						style:aspect-ratio="{logo.width} / {logo.height}"
					></span>
				</li>
			{/each}
		</ul>

		<p class="font-sans text-[0.72rem] font-semibold tracking-[0.16em] text-brand uppercase">
			{m.degree} · {m.department} · {m.date}
		</p>

		<h1
			class="mt-5 text-[2.35rem] leading-[1.08] font-bold tracking-[-0.015em] text-balance sm:text-[3.25rem]"
		>
			{m.title}
		</h1>
		<p class="mt-4 text-xl text-muted-foreground italic sm:text-2xl">{m.subtitle}</p>

		<div class="mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-sans text-sm">
			<div>
				<span class="text-muted-foreground">Author</span>
				<span class="ml-1.5 font-medium">{m.author}</span>
			</div>
			<div>
				<span class="text-muted-foreground">Supervisors</span>
				<span class="ml-1.5">{[...m.supervisors, m.companySupervisor].join(', ')}</span>
			</div>
			<div>
				<span class="text-muted-foreground">Industry partner</span>
				<span class="ml-1.5">Ardoq</span>
			</div>
		</div>

		<div class="mt-9 flex flex-wrap gap-2.5 font-sans">
			<Button size="lg" href="#abstract" class="h-10 px-4">
				<BookOpen />
				Start reading
			</Button>
			<Button size="lg" variant="outline" class="h-10 px-4" onclick={onpdf}>
				<FileText />
				View PDF
			</Button>
			<Button
				size="lg"
				variant="ghost"
				class="h-10 px-4"
				href={m.pdf.src}
				download="Nygard-MSc-thesis-2026.pdf"
			>
				<Download />
				Download
			</Button>
		</div>

		<dl
			class="mt-14 grid gap-px overflow-hidden rounded-xl border bg-border font-sans sm:grid-cols-[1.35fr_1fr_1fr]"
		>
			{#each findings as f (f.value)}
				<div class="bg-card px-5 py-4">
					<dt class="sr-only">{f.label}</dt>
					<dd
						class="font-serif text-[1.5rem] leading-tight font-bold tracking-tight whitespace-nowrap tabular-nums"
					>
						{f.value}
					</dd>
					<dd class="mt-1 text-[0.78rem] leading-snug text-muted-foreground">{f.label}</dd>
				</div>
			{/each}
		</dl>

		<p class="mt-5 font-sans text-[0.78rem] text-muted-foreground">
			24 tasks · 7 repeats · 504 evaluation runs
		</p>
		<ul
			class="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 font-sans text-[0.78rem] text-muted-foreground"
		>
			{#each harnesses as h (h.code)}
				<li><span class="font-semibold text-foreground">{h.code}</span> {h.name}</li>
			{/each}
		</ul>
	</div>
</header>

<style>
	/* The logo files only supply a shape; the colour follows the theme. */
	.logo {
		background-color: currentColor;
		mask: var(--logo) center / contain no-repeat;
		-webkit-mask: var(--logo) center / contain no-repeat;
	}
</style>
