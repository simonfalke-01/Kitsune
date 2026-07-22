import { p as spread_props, x as escape_html } from "./index-server.js";
import { t as Icon } from "./Icon.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/search.svelte
function Search($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "search" },
		props,
		{ iconNode: [["path", { "d": "m21 21-4.34-4.34" }], ["circle", {
			"cx": "11",
			"cy": "11",
			"r": "8"
		}]] }
	]));
}
//#endregion
//#region src/lib/components/EmptyState.svelte
function EmptyState($$renderer, $$props) {
	let { title, detail, action } = $$props;
	$$renderer.push(`<section class="empty svelte-13862ru" aria-labelledby="empty-title"><div class="icon svelte-13862ru" aria-hidden="true">`);
	Search($$renderer, {
		size: 19,
		strokeWidth: 1.7
	});
	$$renderer.push(`<!----></div> <h2 id="empty-title" class="svelte-13862ru">${escape_html(title)}</h2> `);
	if (detail) {
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<p class="svelte-13862ru">${escape_html(detail)}</p>`);
	} else $$renderer.push("<!--[-1-->");
	$$renderer.push(`<!--]--> `);
	if (action) {
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<div class="action svelte-13862ru">`);
		action($$renderer);
		$$renderer.push(`<!----></div>`);
	} else $$renderer.push("<!--[-1-->");
	$$renderer.push(`<!--]--></section>`);
}
//#endregion
export { Search as n, EmptyState as t };
