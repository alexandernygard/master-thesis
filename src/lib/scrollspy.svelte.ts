/**
 * Tracks which heading the reader is in. Element offsets are measured once and
 * re-measured when the document resizes (lazy images, fonts), so a scroll only
 * costs a binary search.
 */
export class ScrollSpy {
	active = $state<string | null>(null);
	/** 0..1 through the whole document. */
	progress = $state(0);

	#ids: string[];
	#tops: number[] = [];
	#offset: number;

	constructor(ids: string[], offset = 120) {
		this.#ids = ids;
		this.#offset = offset;
	}

	attach(root: HTMLElement) {
		const measure = () => {
			this.#tops = this.#ids.map((id) => {
				const el = document.getElementById(id);
				return el ? el.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY;
			});
			update();
		};

		const update = () => {
			const y = window.scrollY + this.#offset;
			let lo = 0;
			let hi = this.#tops.length - 1;
			let found = -1;
			while (lo <= hi) {
				const mid = (lo + hi) >> 1;
				if (this.#tops[mid] <= y) {
					found = mid;
					lo = mid + 1;
				} else hi = mid - 1;
			}
			this.active = found >= 0 ? this.#ids[found] : null;
			const max = document.documentElement.scrollHeight - window.innerHeight;
			this.progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
		};

		let frame = 0;
		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				update();
			});
		};

		let resizeTimer: ReturnType<typeof setTimeout>;
		const observer = new ResizeObserver(() => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(measure, 100);
		});
		observer.observe(root);
		window.addEventListener('scroll', onScroll, { passive: true });
		measure();

		return () => {
			observer.disconnect();
			window.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(frame);
			clearTimeout(resizeTimer);
		};
	}
}
