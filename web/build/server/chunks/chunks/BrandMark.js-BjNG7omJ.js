import { p as preferences } from './index.svelte.js-BSj0vCZL.js';

//#region src/lib/components/BrandMark.svelte
function BrandMark($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { compact = false } = $$props;
		if (preferences.branding) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<span class="brand svelte-6d62c" aria-label="Kitsune"><span class="placeholder svelte-6d62c" aria-hidden="true"><i class="svelte-6d62c"></i><i class="svelte-6d62c"></i><b class="svelte-6d62c"></b></span> `);
			if (!compact) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="wordmark svelte-6d62c">Kitsune</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></span>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]-->`);
	});
}

export { BrandMark as B };
//# sourceMappingURL=BrandMark.js-BjNG7omJ.js.map
