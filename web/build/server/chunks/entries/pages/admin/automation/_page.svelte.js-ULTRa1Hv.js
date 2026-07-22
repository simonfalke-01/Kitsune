import { T as escape_html, U as spread_props } from '../../../../chunks/index-server.js-Chdi67Z_.js';
import { I as Icon } from '../../../../chunks/Icon.js-7T_iTbUI.js';
import { F as Funnel } from '../../../../chunks/funnel.js-B0K6Fx8b.js';
import { P as Plus } from '../../../../chunks/plus.js-B5RxySxD.js';
import { R as Radio } from '../../../../chunks/radio.js-C1huoo0Z.js';
import { B as Button } from '../../../../chunks/Button.js-CFr2qd92.js';
import { B as Badge } from '../../../../chunks/Badge.js-Cc55HWA_.js';
import { C as Card } from '../../../../chunks/Card.js--UQVbkC4.js';
import '../../../../chunks/uneval.js-BE77gmoB.js';

//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/play.svelte
function Play($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "play" },
		props,
		{ iconNode: [["path", { "d": "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" }]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/send.svelte
function Send($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "send" },
		props,
		{ iconNode: [["path", { "d": "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" }], ["path", { "d": "m21.854 2.147-10.94 10.939" }]] }
	]));
}
//#endregion
//#region src/routes/admin/automation/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let enabled = false;
		let testing = false;
		async function dryRun() {
			testing = true;
			await new Promise((resolve) => setTimeout(resolve, 400));
			testing = false;
		}
		$$renderer.push(`<section class="page admin-page svelte-1ugcod0"><div class="split-header"><div><p class="eyebrow">Automation</p> <h1 class="title">Let events carry the work.</h1> <p class="lede">Typed triggers, guarded conditions, and bounded actions—versioned as one flow.</p></div> <div class="actions svelte-1ugcod0">`);
		Button($$renderer, {
			variant: "secondary",
			loading: testing,
			onclick: dryRun,
			children: ($$renderer) => {
				Play($$renderer, { size: 16 });
				$$renderer.push(`<!---->Dry run`);
			}});
		$$renderer.push(`<!---->`);
		Button($$renderer, {
			onclick: () => enabled = !enabled,
			children: ($$renderer) => {
				$$renderer.push(`<!---->${escape_html(enabled ? "Disable flow" : "Enable flow")}`);
			}});
		$$renderer.push(`<!----></div></div> `);
		Card($$renderer, {
			padded: false,
			elevated: true,
			children: ($$renderer) => {
				$$renderer.push(`<div class="flowbar svelte-1ugcod0"><div class="svelte-1ugcod0"><strong class="svelte-1ugcod0">Celebrate first blood</strong><span class="svelte-1ugcod0">Version 1 · draft</span></div> `);
				Badge($$renderer, {
					tone: enabled ? "success" : "warning",
					children: ($$renderer) => {
						$$renderer.push(`<!---->${escape_html(enabled ? "Active" : "Draft")}`);
					}});
				$$renderer.push(`<!----></div> <div class="canvas svelte-1ugcod0" aria-label="Automation flow editor"><article class="node trigger svelte-1ugcod0"><div class="node-icon svelte-1ugcod0">`);
				Radio($$renderer, { size: 17 });
				$$renderer.push(`<!----></div> <div class="svelte-1ugcod0"><small class="svelte-1ugcod0">Trigger</small><strong class="svelte-1ugcod0">First blood earned</strong><span class="svelte-1ugcod0">Any Jeopardy challenge</span></div></article> <div class="edge svelte-1ugcod0" aria-hidden="true"></div> <article class="node condition svelte-1ugcod0"><div class="node-icon svelte-1ugcod0">`);
				Funnel($$renderer, { size: 17 });
				$$renderer.push(`<!----></div> <div class="svelte-1ugcod0"><small class="svelte-1ugcod0">Condition</small><strong class="svelte-1ugcod0">Division is student</strong><span class="svelte-1ugcod0">Typed event filter</span></div></article> <div class="edge svelte-1ugcod0" aria-hidden="true"></div> <article class="node action svelte-1ugcod0"><div class="node-icon svelte-1ugcod0">`);
				Send($$renderer, { size: 17 });
				$$renderer.push(`<!----></div> <div class="svelte-1ugcod0"><small class="svelte-1ugcod0">Action</small><strong class="svelte-1ugcod0">Post to Discord</strong><span class="svelte-1ugcod0">Integration disabled</span></div></article> <button class="add-node svelte-1ugcod0" type="button">`);
				Plus($$renderer, { size: 17 });
				$$renderer.push(`<!----><span class="svelte-1ugcod0">Add action</span></button></div>`);
			}});
		$$renderer.push(`<!----></section>`);
	});
}

export { _page as default };
//# sourceMappingURL=_page.svelte.js-ULTRa1Hv.js.map
