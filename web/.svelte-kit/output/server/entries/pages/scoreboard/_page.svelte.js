import { u as head, x as escape_html } from "../../../chunks/index-server.js";
import { t as Radio } from "../../../chunks/radio.js";
import { t as EmptyState } from "../../../chunks/EmptyState.js";
import { t as Trophy } from "../../../chunks/trophy.js";
import { t as realtime } from "../../../chunks/realtime.svelte.js";
import { t as Badge } from "../../../chunks/Badge.js";
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
			},
			$$slots: { default: true }
		});
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
				action,
				$$slots: { action: true }
			});
		}
		$$renderer.push(`<!----></div>`);
	});
}
//#endregion
export { _page as default };
