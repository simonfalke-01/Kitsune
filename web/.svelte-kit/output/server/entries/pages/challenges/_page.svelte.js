import { u as head, v as attr } from "../../../chunks/index-server.js";
import { t as Funnel } from "../../../chunks/funnel.js";
import { n as Search, t as EmptyState } from "../../../chunks/EmptyState.js";
import { r as toned, t as copy } from "../../../chunks/index.svelte.js";
//#region src/routes/challenges/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let query = "";
		head("1b1r7oj", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Challenges — Kitsune</title>`);
			});
		});
		$$renderer.push(`<div class="page"><div class="split-header"><div><p class="eyebrow">Jeopardy</p> <h1 class="title">Challenges</h1> <p class="lede">Choose carefully. Every trail tells you something.</p></div> <div class="tools svelte-1b1r7oj"><label class="svelte-1b1r7oj"><span class="sr-only">Search challenges</span>`);
		Search($$renderer, { size: 15 });
		$$renderer.push(`<!----><input${attr("value", query)} placeholder="Search" class="svelte-1b1r7oj"/></label> <button type="button" class="svelte-1b1r7oj">`);
		Funnel($$renderer, { size: 15 });
		$$renderer.push(`<!----> Filter</button></div></div> `);
		EmptyState($$renderer, {
			title: toned(copy("empty").challenges),
			detail: "The board updates live when an organizer publishes a challenge."
		});
		$$renderer.push(`<!----></div>`);
	});
}
//#endregion
export { _page as default };
