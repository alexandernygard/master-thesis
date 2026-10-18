import data from './thesis.json';

export interface OutlineItem {
	id: string;
	number: string | null;
	title: string;
	page?: number | null;
	children?: OutlineItem[];
}

export interface Chapter {
	id: string;
	kind: 'chapter' | 'appendix';
	number: string;
	title: string;
	page: number | null;
	sections: OutlineItem[];
}

export interface Reference {
	key: string;
	n: number;
	html: string;
	short: string;
	year: string;
	title: string;
	url: string | null;
}

export interface Thesis {
	meta: {
		title: string;
		subtitle: string;
		author: string;
		degree: string;
		institution: string;
		department: string;
		date: string;
		supervisors: string[];
		companySupervisor: string;
		keywords: string[];
		logos: { name: string; src: string; width: number; height: number }[];
		pdf: { src: string; bytes: number | null; pageOffset: number };
	};
	front: { id: string; title: string }[];
	chapters: Chapter[];
	references: Reference[];
}

export const thesis = data as Thesis;

export const referencesByKey = new Map(thesis.references.map((r) => [r.key, r]));

/** Physical PDF page for a printed (arabic) page number. */
export function pdfPage(printed: number | null | undefined) {
	return printed ? printed + thesis.meta.pdf.pageOffset : 1;
}

/** Ids of every heading the reader can be "in", in document order. */
export interface NavEntry {
	id: string;
	label: string;
	number: string | null;
	depth: 0 | 1 | 2;
	parent: string | null;
	page: number | null;
}

const front = Object.fromEntries(thesis.front.map((f) => [f.id, f]));

export const BIBLIOGRAPHY_ID = 'bibliography';

function chapterEntries(c: Chapter): NavEntry[] {
	return [
		{ id: c.id, label: c.title, number: c.number, depth: 0, parent: null, page: c.page },
		...c.sections.flatMap((s) => [
			{
				id: s.id,
				label: s.title,
				number: s.number,
				depth: 1 as const,
				parent: c.id,
				page: s.page ?? null
			},
			...(s.children ?? []).map((cc) => ({
				id: cc.id,
				label: cc.title,
				number: cc.number,
				depth: 2 as const,
				parent: s.id,
				page: null
			}))
		])
	];
}

const mainChapters = thesis.chapters.filter((c) => c.kind === 'chapter');
const appendices = thesis.chapters.filter((c) => c.kind === 'appendix');

/** The reading order of the website. */
export const nav: { group: string; entries: NavEntry[] }[] = [
	{
		group: 'Front matter',
		entries: [
			{
				id: 'abstract',
				label: front.abstract.title,
				number: null,
				depth: 0,
				parent: null,
				page: null
			}
		]
	},
	{ group: 'Chapters', entries: mainChapters.flatMap(chapterEntries) },
	{
		group: 'Back matter',
		entries: [
			{
				id: BIBLIOGRAPHY_ID,
				label: 'Bibliography',
				number: null,
				depth: 0,
				parent: null,
				page: 77
			},
			...appendices.flatMap(chapterEntries),
			{
				id: 'acknowledgements',
				label: front.acknowledgements.title,
				number: null,
				depth: 0,
				parent: null,
				page: null
			},
			{
				id: 'ai-declaration',
				label: 'Use of Generative AI',
				number: null,
				depth: 0,
				parent: null,
				page: null
			}
		]
	}
];

export const navEntries = nav.flatMap((g) => g.entries);
export const navById = new Map(navEntries.map((e) => [e.id, e]));
export { mainChapters, appendices };
