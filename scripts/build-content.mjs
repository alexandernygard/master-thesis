#!/usr/bin/env node
/**
 * Converts the LaTeX thesis sources into structured content for the website.
 *
 *   THESIS_SRC=/path/to/msc-thesis-writer node scripts/build-content.mjs
 *
 * Writes src/lib/content/thesis.json and the converted figures in static/figures/.
 * Both outputs are committed, so the site builds without access to the LaTeX sources.
 *
 * Pipeline per source file:
 *   1. inline \input files and rewrite macros pandoc doesn't know (citations,
 *      algorithmic traces, \nolinkurl, ...)
 *   2. pandoc LaTeX -> HTML
 *   3. post-process the HTML with cheerio: numbering and cross-references from
 *      main.aux (so numbers match the PDF exactly), numbered citations in the
 *      order of main.bbl, figures converted to SVG/WebP, math rendered with KaTeX.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import katex from 'katex';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(
	process.env.THESIS_SRC ?? join(ROOT, '..', '..', 'DTU', 'THESIS', 'msc-thesis-writer')
);
const OUT_JSON = join(ROOT, 'src/lib/content/thesis.json');
const OUT_BODY = join(ROOT, 'src/lib/content/body.json');
const FIG_DIR = join(ROOT, 'static/figures');

/** Printed page 1 (Introduction) is physical page 11 of the PDF. */
const PDF_PAGE_OFFSET = 10;

if (!existsSync(join(SRC, 'main.tex'))) {
	console.error(`Thesis sources not found at ${SRC}. Set THESIS_SRC.`);
	process.exit(1);
}

const read = (p) => readFileSync(join(SRC, p), 'utf8');
const warn = (...m) => console.warn('  !', ...m);

// ---------------------------------------------------------------------------
// main.aux: label -> { kind, number, page }
// ---------------------------------------------------------------------------

/** Reads a balanced {...} group starting at s[i] === '{'. Returns [content, endIndex]. */
function group(s, i) {
	let depth = 0;
	for (let j = i; j < s.length; j++) {
		if (s[j] === '\\') {
			j++;
			continue;
		}
		if (s[j] === '{') depth++;
		else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
	}
	throw new Error('unbalanced group');
}

const labels = new Map();
for (const line of read('main.aux').split('\n')) {
	const m = line.match(/^\\newlabel\{([^}]+)@cref\}/);
	if (!m) continue;
	const [body] = group(line, line.indexOf('}{') + 1);
	// body: {[figure][1][0,2]2.1}{[1][5][]5}
	const [first, next] = group(body, 0);
	const [second] = group(body, next);
	const km = first.match(/^\[([^\]]*)\]\[[^\]]*\]\[[^\]]*\](.*)$/);
	const page = second.replace(/^(\[[^\]]*\])*/, '');
	if (km) labels.set(m[1], { kind: km[1], number: km[2], page: /^\d+$/.test(page) ? +page : null });
}

// Chapter and section pages from the table of contents (for unlabelled headings).
const tocPages = [];
for (const line of read('main.toc').split('\n')) {
	const m = line.match(/^\\contentsline \{(chapter|section)\}\{(?:\\numberline \{([^}]*)\})?/);
	if (!m || !m[2]) continue;
	const page = line.match(/\}\{(\d+)\}\{[^}]*\}%?$/);
	if (page) tocPages.push({ level: m[1], number: m[2], page: +page[1] });
}
const pageForNumber = (n) => tocPages.find((t) => t.number === n)?.page ?? null;

// ---------------------------------------------------------------------------
// Bibliography: citation numbers follow main.bbl (biblatex numeric, sorting=none)
// ---------------------------------------------------------------------------

const citeOrder = [...read('main.bbl').matchAll(/\\entry\{([^}]+)\}/g)].map((m) => m[1]);
const citeNumber = new Map(citeOrder.map((k, i) => [k, i + 1]));
const csl = new Map(
	JSON.parse(
		execFileSync('pandoc', [join(SRC, 'bibliography.bib'), '-t', 'csljson'], {
			maxBuffer: 1 << 26
		}).toString()
	).map((e) => [e.id, e])
);

const esc = (s) =>
	String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

function nameOf(a, full = false) {
	if (a.literal) return a.literal;
	const family = [a['non-dropping-particle'], a.family].filter(Boolean).join(' ');
	if (!full) return family;
	const initials = (a.given ?? '')
		.split(/[\s]+/)
		.filter(Boolean)
		.map((g) =>
			g
				.split('-')
				.map((p) => p[0] + '.')
				.join('-')
		)
		.join(' ');
	return [initials, a['dropping-particle'], family].filter(Boolean).join(' ');
}

/** Author part of \citet, following biblatex's default maxcitenames=3. */
function citetNames(key) {
	const authors = csl.get(key)?.author ?? csl.get(key)?.editor ?? [];
	if (!authors.length) return csl.get(key)?.title ?? key;
	const names = authors.map((a) => nameOf(a));
	if (names.length > 3) return `${names[0]} et al.`;
	if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
	return names.join(' and ');
}

function joinNames(names) {
	if (names.length <= 2) return names.join(' and ');
	return names.slice(0, -1).join(', ') + ', and ' + names.at(-1);
}

function formatReference(key) {
	const e = csl.get(key);
	if (!e) {
		warn('missing bib entry', key);
		return { html: esc(key), short: key, year: '', title: key, url: null };
	}
	const authors = (e.author ?? e.editor ?? []).map((a) => nameOf(a, true));
	const year = e.issued?.['date-parts']?.[0]?.[0] ?? e.issued?.literal ?? '';
	const title = e.title ?? '';
	const container = e['container-title'] ?? e.publisher ?? e['collection-title'] ?? '';
	const url = e.DOI ? `https://doi.org/${e.DOI}` : (e.URL ?? null);
	const parts = [];
	if (authors.length) parts.push(`<span class="ref-authors">${esc(joinNames(authors))}</span>.`);
	const book = e.type === 'book' || e.type === 'report';
	parts.push(
		book
			? `<cite class="ref-title">${esc(title)}</cite>.`
			: `<span class="ref-title">${esc(title)}</span>.`
	);
	const venue = [
		container && `<em>${esc(container)}</em>`,
		e.volume && `vol. ${esc(e.volume)}`,
		e.page && `pp. ${esc(e.page)}`
	]
		.filter(Boolean)
		.join(', ');
	if (venue) parts.push(`${venue}${year ? ',' : '.'}`);
	if (year) parts.push(`${esc(year)}.`);
	if (url)
		parts.push(
			`<a class="ref-link" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(e.DOI ? `doi:${e.DOI}` : url.replace(/^https?:\/\//, ''))}</a>`
		);
	return { html: parts.join(' '), short: citetNames(key), year: String(year), title, url };
}

const references = citeOrder.map((key) => ({
	key,
	n: citeNumber.get(key),
	...formatReference(key)
}));

// ---------------------------------------------------------------------------
// LaTeX preprocessing
// ---------------------------------------------------------------------------

const MACROS = String.raw`
\newcommand{\thesistitle}{Agent-System Interface Designs for Enterprise Platforms}
\newcommand{\thesissubtitle}{A Comparative Empirical Study}
\newcommand{\thesisauthor}{Alexander Nygård}
\newcommand{\reviewernote}[1]{}
\newcommand{\writernote}[1]{}
\newcommand{\boldmath}{}
`;

function inlineInputs(tex, depth = 0) {
	return tex
		.split('\n')
		.map((line) => {
			const code = line.replace(/(?<!\\)%.*$/, '');
			const m = code.match(/\\input\{([^}]+)\}/);
			if (!m) return line;
			const p = m[1].endsWith('.tex') ? m[1] : `${m[1]}.tex`;
			if (!existsSync(join(SRC, p))) {
				warn('missing input', p);
				return '';
			}
			return code.replace(m[0], () => '\n' + inlineInputs(read(p), depth + 1) + '\n');
		})
		.join('\n');
}

/** Replaces \name{arg} (balanced) using fn(arg, optional). */
function replaceCommand(tex, name, fn) {
	const re = new RegExp(String.raw`\\${name}(?![A-Za-z])\s*(\[[^\]]*\])?\s*\{`, 'g');
	let out = '';
	let last = 0;
	let m;
	while ((m = re.exec(tex))) {
		const start = m.index + m[0].length - 1;
		const [arg, end] = group(tex, start);
		out += tex.slice(last, m.index) + fn(arg, m[1]?.slice(1, -1));
		last = end;
		re.lastIndex = end;
	}
	return out + tex.slice(last);
}

/** A \verb with a delimiter that does not occur in the content. */
function verb(s) {
	const d = ['|', '!', '+', '=', '@', '"'].find((c) => !s.includes(c));
	return `\\verb${d}${s}${d}`;
}

function preprocess(tex) {
	tex = inlineInputs(tex);
	// Citations become links we rewrite after conversion; pandoc keeps hrefs verbatim.
	for (const [cmd, mode] of [
		['citep', 'p'],
		['citet', 't'],
		['cite', 'p'],
		['parencite', 'p'],
		['textcite', 't']
	]) {
		tex = replaceCommand(tex, cmd, (keys, opt) => {
			const k = keys.replace(/\s+/g, '');
			return `\\href{cite:${mode}:${k}${opt ? '|' + encodeURIComponent(opt) : ''}}{c}`;
		});
	}
	// \subcaptionbox{caption}{content} -> a subfigure environment pandoc understands.
	tex = (() => {
		let out = '';
		let i = 0;
		for (let at; (at = tex.indexOf('\\subcaptionbox{', i)) !== -1;) {
			const [caption, afterCaption] = group(tex, at + '\\subcaptionbox'.length);
			const open = tex.indexOf('{', afterCaption);
			const [content, end] = group(tex, open);
			const label = caption.match(/\\label\{[^}]+\}/)?.[0] ?? '';
			const text = caption.replace(label, '');
			out +=
				tex.slice(i, at) +
				`\\begin{subfigure}{0.48\\linewidth}${content}\\caption{${text}}${label}\\end{subfigure}`;
			i = end;
		}
		return out + tex.slice(i);
	})();
	// pandoc drops labels inside subfigures; carry them through as marker links.
	tex = tex.replace(/\\begin\{subfigure\}[\s\S]*?\\end\{subfigure\}/g, (env) =>
		env.replace(/\\label\{([^}]+)\}/g, (_, l) => `\\href{label:${l}}{l}`)
	);
	tex = replaceCommand(tex, 'subref', (label) => `\\href{subref:${label}}{s}`);
	tex = replaceCommand(tex, 'nolinkurl', (s) => verb(s.replace(/\\_/g, '_')));
	tex = replaceCommand(tex, 'codeaction', (s) => verb(s));
	// The trace figure: algorithmic steps become an ordered list.
	tex = tex.replace(
		/\\newcommand\{\\traceblock\}\[1\]\{[^\n]*\}/,
		String.raw`\newcommand{\traceblock}[1]{#1}`
	);
	tex = tex
		.replace(/\\begin\{algorithmic\}(\[\d+\])?/g, '\\begin{enumerate}')
		.replace(/\\end\{algorithmic\}/g, '\\end{enumerate}');
	tex = tex.replace(/\\STATE\b/g, '\\item');
	// xltabular is unknown to pandoc; longtable with the X column as a plain column is.
	tex = replaceCommand(
		tex,
		'begin\\{xltabular\\}\\{[^}]*\\}',
		(spec) => `\\begin{longtable}{${spec.replace(/%\n\s*/g, '').replace(/X\s*$/, 'l')}}`
	);
	tex = tex.replace(/\\end\{xltabular\}/g, '\\end{longtable}');
	// Repeated page headers/footers of long tables are print-only.
	tex = tex
		.replace(/\\endfirsthead[\s\S]*?\\endlastfoot/g, '')
		.replace(/\\endfirsthead[\s\S]*?\\endfoot/g, '');
	tex = tex
		.replace(/\\begin\{wrapfigure\}(\[[^\]]*\])?\{[^}]*\}\{[^}]*\}/g, '\\begin{figure}')
		.replace(/\\end\{wrapfigure\}/g, '\\end{figure}');
	return MACROS + tex;
}

function pandoc(tex, from = 'latex') {
	return execFileSync(
		'pandoc',
		['-f', from, '-t', 'html5', '--katex', '--section-divs', '--wrap=none'],
		{
			input: tex,
			cwd: SRC,
			maxBuffer: 1 << 28
		}
	).toString();
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

rmSync(FIG_DIR, { recursive: true, force: true });
mkdirSync(FIG_DIR, { recursive: true });
const figureCache = new Map();

function slug(p) {
	return p
		.replace(/^Figures\//, '')
		.replace(/\.[a-z]+$/i, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

/** Converts a figure to a web format and returns { src, width, height }. */
function convertFigure(p) {
	if (figureCache.has(p)) return figureCache.get(p);
	let file = p;
	if (!existsSync(join(SRC, file))) {
		const found = ['.pdf', '.png', '.jpg'].map((x) => p + x).find((x) => existsSync(join(SRC, x)));
		if (!found) {
			warn('missing figure', p);
			return null;
		}
		file = found;
	}
	const abs = join(SRC, file);
	const ext = extname(file).toLowerCase();
	const name = slug(file);
	let result;
	if (ext === '.pdf') {
		const out = join(FIG_DIR, `${name}.svg`);
		execFileSync('pdftocairo', ['-svg', '-f', '1', '-l', '1', abs, out]);
		const svg = readFileSync(out, 'utf8');
		const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
		result = { src: `/figures/${name}.svg`, width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
	} else {
		const out = join(FIG_DIR, `${name}.webp`);
		const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', abs]).toString();
		const w = +info.match(/pixelWidth: (\d+)/)[1];
		const h = +info.match(/pixelHeight: (\d+)/)[1];
		const maxW = 2400;
		const args = ['-quiet', '-q', '86', '-m', '6', '-mt'];
		if (w > maxW) args.push('-resize', String(maxW), '0');
		execFileSync('cwebp', [...args, abs, '-o', out]);
		const scale = w > maxW ? maxW / w : 1;
		result = {
			src: `/figures/${name}.webp`,
			width: Math.round(w * scale),
			height: Math.round(h * scale)
		};
	}
	figureCache.set(p, result);
	return result;
}

// ---------------------------------------------------------------------------
// HTML post-processing
// ---------------------------------------------------------------------------

const KIND_NAMES = { figure: 'Figure', table: 'Table', listing: 'Listing' };
const usedCitations = new Set();

function renderMath($) {
	$('span.math').each((_, el) => {
		const node = $(el);
		const display = node.hasClass('display');
		const src = node
			.text()
			.replace(/^\\\(|\\\)$/g, '')
			.replace(/^\\\[|\\\]$/g, '');
		// Plain numbers (table cells, "30.8 s") read better in the surrounding font.
		const plain = src
			.replace(/\\pm/g, '±')
			.replace(/\\times/g, '×')
			.replace(/\\rightarrow/g, '→')
			.replace(/~/g, '\u00a0')
			.replace(/\\[,;]/g, '\u2009')
			.replace(/\\%/g, '%')
			.replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, '$1')
			.replace(/(\S)\s*([±×])\s*(\S)/g, '$1 $2 $3')
			.replace(/(^|[\s[(])-(?=\d)/g, '$1−')
			.trim();
		if (
			!display &&
			(/^[±→]$/.test(plain) ||
				(/^<?[\d.,%±×+−()[\]\s\u2009\u00a0]*(?:k|s|ms|pp|M)?(?:[\s\u2009]*[±×][\s\u2009]*[\d.,%[\]\s\u2009]*(?:k|s|ms|pp|M)?)?$/.test(
					plain
				) &&
					/\d/.test(plain)))
		) {
			node.replaceWith(`<span class="num">${esc(plain)}</span>`);
			return;
		}
		try {
			node.replaceWith(
				katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html' })
			);
		} catch (e) {
			warn('katex', src, e.message);
		}
	});
}

function citationHtml(href) {
	const [, mode, rest] = href.match(/^cite:(\w):(.*)$/);
	const [keyList, opt] = rest.split('|');
	const keys = keyList.split(',').filter(Boolean);
	const links = keys.map((k) => {
		usedCitations.add(k);
		const n = citeNumber.get(k);
		if (!n) warn('uncited/unknown key', k);
		return `<a class="cite" href="#ref-${esc(k)}" data-cite="${esc(k)}">${n ?? '?'}</a>`;
	});
	const note = opt ? `, ${esc(decodeURIComponent(opt).replace(/~/g, ' '))}` : '';
	const bracket = `<span class="cite-group">[${links.join(', ')}${note}]</span>`;
	if (mode === 't') return `${keys.map((k) => esc(citetNames(k))).join('; ')} ${bracket}`;
	return bracket;
}

/** LaTeX snippets inside attributes (listing captions) converted in one pandoc call. */
function convertInline(texts) {
	if (!texts.length) return [];
	const sep = '\n\nZZSEPARATORZZ\n\n';
	const html = pandoc(preprocess(texts.join(sep)));
	return html.split(/<p>ZZSEPARATORZZ<\/p>/).map((s) =>
		s
			.trim()
			.replace(/^<p>/, '')
			.replace(/<\/p>$/, '')
	);
}

/**
 * @param html pandoc output
 * @param ctx { chapterNumber: string|null, footnotePrefix: string }
 */
function postprocess(html, ctx) {
	const $ = cheerio.load(html, null, false);

	// Citations and sub-figure references.
	$('a[href^="cite:"]').each((_, el) => {
		$(el).replaceWith(citationHtml($(el).attr('href')));
	});
	$('a[href^="label:"]').each((_, el) => {
		const node = $(el);
		const fig = node.closest('figure');
		if (fig.length && !fig.attr('id')) fig.attr('id', node.attr('href').slice(6));
		const p = node.parent('p');
		node.remove();
		if (p.length && !p.text().trim()) p.remove();
	});
	$('a[href^="subref:"]').each((_, el) => {
		const label = $(el).attr('href').slice(7);
		const n = labels.get(label)?.number ?? '';
		const letter = n.match(/[a-z]$/)?.[0] ?? '?';
		$(el).replaceWith(`<a class="xref" href="#${esc(label)}">(${letter})</a>`);
	});

	// Cross references use the numbers LaTeX computed.
	$('a[data-reference-type]').each((_, el) => {
		const node = $(el);
		const label = node.attr('data-reference');
		const info = labels.get(label);
		if (!info) warn('unresolved ref', label);
		node.text(info?.number ?? '??');
		node.removeAttr('data-reference-type').removeAttr('data-reference').addClass('xref');
	});

	// Headings: numbers, anchors.
	const counters = [0, 0, 0];
	$('section').each((_, el) => {
		const sec = $(el);
		const level = +(sec.attr('class')?.match(/level(\d)/)?.[1] ?? 0);
		const heading = sec.children(`h${level}`).first();
		const unnumbered = sec.hasClass('unnumbered') || level > 3;
		let number = null;
		if (level >= 2 && level <= 3 && !unnumbered && ctx.chapterNumber) {
			counters[level - 2]++;
			for (let i = level - 1; i < counters.length; i++) counters[i] = 0;
			number = [ctx.chapterNumber, ...counters.slice(0, level - 1)].join('.');
			const auxNumber = labels.get(sec.attr('id'))?.number;
			if (auxNumber && auxNumber !== number)
				warn(`section number mismatch ${sec.attr('id')}: ${number} vs ${auxNumber}`);
		}
		if (number) {
			heading.attr('data-number', number);
			heading.prepend(`<span class="heading-number">${number}</span>`);
		}
		sec.attr('data-level', String(level));
	});

	// Figures: convert images, prefix captions.
	$('img, embed').each((_, el) => {
		const node = $(el);
		const fig = convertFigure(node.attr('src'));
		if (!fig) return node.remove();
		const width = node.attr('style')?.match(/width:\s*([\d.]+)%/)?.[1];
		const alt = node
			.closest('figure')
			.children('figcaption')
			.first()
			.text()
			.replace(/\\[a-zA-Z]+/g, '')
			.replace(/\s+/g, ' ')
			.slice(0, 200)
			.trim();
		node.replaceWith(
			`<img src="${fig.src}" width="${fig.width}" height="${fig.height}" loading="lazy" decoding="async" alt="${esc(alt)}"${
				width ? ` style="--fig-width:${width}%"` : ''
			} />`
		);
	});

	// Vertical \rule separators between subfigures arrive as <hr>; the grid layout doesn't need them.
	$('figure > hr').remove();

	$('figure').each((_, el) => {
		const fig = $(el);
		const parentFig = fig.parent().closest('figure');
		const id = fig.attr('id');
		const caption = fig.children('figcaption').first();
		fig.removeAttr('data-latex-placement');
		if (parentFig.length) {
			fig.addClass('subfigure');
			const subId = fig.find('[id]').first().attr('id') ?? id;
			const n = labels.get(subId)?.number;
			const letter =
				n?.match(/[a-z]$/)?.[0] ?? String.fromCharCode(97 + fig.prevAll('figure').length);
			caption.prepend(`<span class="caption-label">(${letter})</span> `);
			return;
		}
		const subs = fig.children('figure');
		if (subs.length) {
			// Panel widths proportional to aspect ratio give every image in the row the same height.
			let sum = 0;
			subs.each((__, sub) => {
				const img = $(sub).find('img').first();
				const ar = +img.attr('width') / +img.attr('height') || 1;
				sum += ar;
				$(sub).attr('style', `--ar:${ar.toFixed(3)}`);
			});
			fig
				.addClass('has-subfigures')
				.attr('style', `--ar-sum:${sum.toFixed(3)};--panels:${subs.length}`);
			// Very wide rows would leave each panel only a few hundred pixels tall: stack them.
			if (sum > 3.2) fig.addClass('stacked');
		}
		if (!fig.find('img').length) fig.addClass('text-figure');
		const n = id && labels.get(id)?.number;
		if (n) caption.prepend(`<span class="caption-label">Figure ${n}</span> `);
		fig.addClass('figure');
	});

	// Tables: pandoc wraps labelled tables in <div id>.
	$('table').each((_, el) => {
		const table = $(el);
		const holder = table.parent('div[id]');
		const id = holder.attr('id') ?? table.attr('id');
		const caption = table.children('caption').first();
		const n = id && labels.get(id)?.number;
		const capHtml = caption.length ? caption.html() : '';
		caption.remove();
		table.find('[style]').each((__, c) => {
			const align = $(c)
				.attr('style')
				.match(/text-align:\s*(\w+)/)?.[1];
			$(c).removeAttr('style');
			if (align) $(c).attr('data-align', align);
		});
		table.find('colgroup').remove();
		const wrapper = `<figure class="table-figure"${id ? ` id="${esc(id)}"` : ''}>${
			capHtml
				? `<figcaption>${n ? `<span class="caption-label">Table ${n}</span> ` : ''}${capHtml}</figcaption>`
				: ''
		}<div class="table-scroll">${$.html(table)}</div></figure>`;
		if (holder.length) holder.replaceWith(wrapper);
		else table.replaceWith(wrapper);
	});

	// Listings.
	const pres = $('pre[data-caption]').toArray();
	const captions = convertInline(pres.map((el) => $(el).attr('data-caption')));
	pres.forEach((el, i) => {
		const pre = $(el);
		const id = pre.attr('id');
		const n = id && labels.get(id)?.number;
		const lang = (pre.attr('style') ?? '').replace(/^thesis/, '') || 'text';
		pre.removeAttr('style').removeAttr('data-caption').removeAttr('data-label').removeAttr('id');
		pre.attr('data-lang', lang);
		pre.replaceWith(
			`<figure class="listing"${id ? ` id="${esc(id)}"` : ''}><figcaption>${n ? `<span class="caption-label">Listing ${n}</span> ` : ''}${captions[i]}</figcaption>${$.html(pre)}</figure>`
		);
	});
	$('pre:not([data-lang])').attr('data-lang', 'text');

	// Minipages (trace figure columns) become a grid.
	$('div.minipage').addClass('trace-column');

	// Footnotes: unique ids per source file.
	$('[id^="fn"], [id^="fnref"]').each((_, el) =>
		$(el).attr('id', ctx.footnotePrefix + $(el).attr('id'))
	);
	$('a[href^="#fn"]').each((_, el) =>
		$(el).attr('href', '#' + ctx.footnotePrefix + $(el).attr('href').slice(1))
	);

	// External links open in a new tab.
	$('a[href^="http"]').attr('target', '_blank').attr('rel', 'noreferrer');

	renderMath($);
	return $;
}

/** Builds the section tree (levels 2-3) for the sidebar. */
function outline($, root) {
	const items = [];
	root.children('section[data-level="2"]').each((_, el) => {
		const sec = $(el);
		const h = sec.children('h2').first();
		const children = [];
		sec.children('section[data-level="3"]').each((__, c) => {
			const cs = $(c);
			const ch = cs.children('h3').first();
			children.push({
				id: cs.attr('id'),
				number: ch.attr('data-number') ?? null,
				title: headingText($, ch)
			});
		});
		const number = h.attr('data-number') ?? null;
		const id = sec.attr('id');
		items.push({
			id,
			number,
			title: headingText($, h),
			page: labels.get(id)?.page ?? (number ? pageForNumber(number) : null),
			children
		});
	});
	return items;
}

function headingText($, h) {
	const c = h.clone();
	c.find('.heading-number').remove();
	return c.text().replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

function convertFile(path, chapterNumber, prefix) {
	console.log('·', path);
	const $ = postprocess(pandoc(preprocess(read(path))), {
		chapterNumber,
		footnotePrefix: `${prefix}-`
	});
	return $;
}

const chapterFiles = [
	'Chapters/01_Introduction.tex',
	'Chapters/02_Background.tex',
	'Chapters/03_Related_Work.tex',
	'Chapters/04_Methodology.tex',
	'Chapters/05_Implementation.tex',
	'Chapters/06_Evaluation.tex',
	'Chapters/07_Conclusion.tex'
];

function chapterFrom(path, number, kind) {
	const $ = convertFile(path, number, `c${number}`);
	const sec = $.root().children('section.level1').first();
	const h1 = sec.children('h1').first();
	const id = sec.attr('id');
	const title = headingText($, h1);
	h1.remove();
	const sections = outline($, sec);
	return {
		id,
		kind,
		number,
		title,
		page: labels.get(id)?.page ?? pageForNumber(number),
		sections,
		html: sec.html().trim()
	};
}

function frontFrom(path, id) {
	const $ = convertFile(path, null, id);
	const sec = $.root().children('section').first();
	const h = sec.children('h2,h1').first();
	const title = headingText($, h);
	h.remove();
	return { id, title, html: sec.html().trim() };
}

const front = [
	frontFrom('Frontmatter/Abstract.tex', 'abstract'),
	frontFrom('Frontmatter/Acknowledgements.tex', 'acknowledgements'),
	frontFrom('Frontmatter/AIDeclaration.tex', 'ai-declaration')
];

const chapters = chapterFiles.map((f, i) => chapterFrom(f, String(i + 1), 'chapter'));
const appendix = chapterFrom('Backmatter/Appendix.tex', 'A', 'appendix');
appendix.id = appendix.id || 'appendix';

// Keywords line from the abstract, kept separately for the hero.
const abstract = front[0];
const kw = abstract.html.match(/<p><strong>Keywords:<\/strong>\s*(.*?)<\/p>/);
if (kw) abstract.html = abstract.html.replace(kw[0], '');
const keywords = kw ? kw[1].split(',').map((s) => s.trim()) : [];

// ---------------------------------------------------------------------------
// Logos for the title block. The page paints them in the current text colour
// through a CSS mask, so each file only needs a clean alpha channel.
// ---------------------------------------------------------------------------

const LOGO_DIR = join(ROOT, 'static/logos');
rmSync(LOGO_DIR, { recursive: true, force: true });
mkdirSync(LOGO_DIR, { recursive: true });

function buildLogos() {
	const logos = [];

	// DTU: vector, drawn in the middle of an A4 page; crop the viewBox to the mark.
	const dtuSvg = join(LOGO_DIR, 'dtu.svg');
	execFileSync('pdftocairo', ['-svg', join(SRC, 'Figures/general/dtu-logo.pdf'), dtuSvg]);
	const [x, y, w, h] = [63, 79, 469, 684];
	writeFileSync(
		dtuSvg,
		readFileSync(dtuSvg, 'utf8').replace(
			/width="[^"]+" height="[^"]+" viewBox="[^"]+"/,
			`width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"`
		)
	);
	logos.push({ name: 'DTU', src: '/logos/dtu.svg', width: w, height: h });

	// EU co-funding mark: dark-on-white PNG. A filter turns darkness into alpha,
	// so the flag and text stay and the white background and yellow stars drop out.
	const eu = join(LOGO_DIR, 'eu-source.png');
	execFileSync('sips', ['--resampleWidth', '720', join(SRC, 'Figures/secclo.png'), '--out', eu]);
	const [ew, eh] = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', eu])
		.toString()
		.match(/\d+/g)
		.slice(-2)
		.map(Number);
	const png = readFileSync(eu).toString('base64');
	writeFileSync(
		join(LOGO_DIR, 'eu.svg'),
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ew} ${eh}"><filter id="a" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.9 -1.8 -0.36 0 2.1"/></filter><image width="${ew}" height="${eh}" filter="url(#a)" href="data:image/png;base64,${png}"/></svg>`
	);
	rmSync(eu);
	logos.push({
		name: 'Co-funded by the European Union',
		src: '/logos/eu.svg',
		width: ew,
		height: eh
	});

	// Ardoq: already transparent.
	const ardoq = join(SRC, 'Figures/ardoq/ardoq-logo.png');
	execFileSync('cwebp', ['-quiet', '-lossless', ardoq, '-o', join(LOGO_DIR, 'ardoq.webp')]);
	logos.push({ name: 'Ardoq', src: '/logos/ardoq.webp', width: 368, height: 356 });
	return logos;
}

const logos = buildLogos();

// The acknowledgements' logo row moves to the title block.
front[1].html = front[1].html.replace(/<div class="center">[\s\S]*?<\/div>\s*$/, '').trim();

const pdfStat = statSync(join(ROOT, 'static/master-thesis.pdf'), { throwIfNoEntry: false });

// Body HTML is only needed while prerendering; the outline ships to the browser.
const body = {};
for (const part of [...front, ...chapters, appendix]) {
	body[part.id] = part.html;
	delete part.html;
}

// Drop converted figures nothing refers to any more.
const referenced = JSON.stringify(body);
for (const { src } of figureCache.values()) {
	if (!referenced.includes(src)) rmSync(join(ROOT, 'static', src));
}

const thesis = {
	meta: {
		title: 'Agent-System Interface Designs for Enterprise Platforms',
		subtitle: 'A Comparative Empirical Study',
		author: 'Alexander Nygård',
		degree: 'MSc thesis',
		institution: 'Technical University of Denmark',
		department: 'DTU Compute',
		date: 'June 2026',
		supervisors: ['Alberto Lafuente', 'Alex Jung'],
		companySupervisor: 'Falco Winkler',
		keywords,
		logos,
		pdf: { src: '/master-thesis.pdf', bytes: pdfStat?.size ?? null, pageOffset: PDF_PAGE_OFFSET }
	},
	front,
	chapters: [...chapters, appendix],
	references
};

const unused = citeOrder.filter((k) => !usedCitations.has(k));
if (unused.length) warn('in bibliography but not cited in converted text:', unused.join(', '));

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(thesis, null, '\t'));
writeFileSync(OUT_BODY, JSON.stringify(body));
const kb = ((statSync(OUT_JSON).size + statSync(OUT_BODY).size) / 1024).toFixed(0);
console.log(
	`\nWrote src/lib/content/ (${kb} KB), ${figureCache.size} figures, ${references.length} references.`
);
