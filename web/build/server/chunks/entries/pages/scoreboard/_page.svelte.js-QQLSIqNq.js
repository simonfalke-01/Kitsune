import { S as head, T as escape_html } from '../../../chunks/index-server.js-Chdi67Z_.js';
import { R as Radio } from '../../../chunks/radio.js-C1huoo0Z.js';
import { E as EmptyState } from '../../../chunks/EmptyState.js-C1hM-P9d.js';
import { T as Trophy } from '../../../chunks/trophy.js-DzME18K8.js';
import { r as realtime } from '../../../chunks/realtime.svelte.js-CFqSmZfC.js';
import { B as Badge } from '../../../chunks/Badge.js-Cc55HWA_.js';
import '../../../chunks/uneval.js-BE77gmoB.js';
import '../../../chunks/Icon.js-7T_iTbUI.js';

//#region src/routes/scoreboard/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		head("17j8adj", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Scoreboard — Kitsune</title>`);
			});
		});
		$$renderer.push(`<div class="page"><div class="split-header"><div><p class="eyebrow">Standings</p> <h1 class="title">Scoreboard</h1> <p class="lede">Every point, in the order it was earned.</p></div> `);
		Badge($$renderer, {
			tone: realtime.connected ? "success" : "warning",
			children: ($$renderer) => {
				Radio($$renderer, { size: 11 });
				$$renderer.push(`<!----> ${escape_html(realtime.connected ? "Live" : "Offline")}`);
			}});
		$$renderer.push(`<!----></div> `);
		{
			function action($$renderer) {
				$$renderer.push(`<div class="trophy svelte-17j8adj">`);
				Trophy($$renderer, { size: 18 });
				$$renderer.push(`<!----> Earliest to reach a tied score ranks first.</div>`);
			}
			EmptyState($$renderer, {
				title: "No standings yet.",
				detail: "Scores appear here after the first accepted flag.",
				action});
		}
		$$renderer.push(`<!----></div>`);
	});
}

export { _page as default };
//# sourceMappingURL=_page.svelte.js-QQLSIqNq.js.map
