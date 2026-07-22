import { S as head, Q as attr } from '../../../chunks/index-server.js-Chdi67Z_.js';
import { F as Funnel } from '../../../chunks/funnel.js-B0K6Fx8b.js';
import { S as Search, E as EmptyState } from '../../../chunks/EmptyState.js-C1hM-P9d.js';
import { t as toned, c as copy } from '../../../chunks/index.svelte.js-BSj0vCZL.js';
import '../../../chunks/uneval.js-BE77gmoB.js';
import '../../../chunks/Icon.js-7T_iTbUI.js';

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

export { _page as default };
//# sourceMappingURL=_page.svelte.js-_ATuUs_5.js.map
