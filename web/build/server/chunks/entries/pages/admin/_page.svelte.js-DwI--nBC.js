import { N as ensure_array_like, U as spread_props, T as escape_html } from '../../../chunks/index-server.js-Chdi67Z_.js';
import { I as Icon } from '../../../chunks/Icon.js-7T_iTbUI.js';
import { A as Activity } from '../../../chunks/activity.js-DOaWs1WE.js';
import { R as Radio } from '../../../chunks/radio.js-C1huoo0Z.js';
import { T as Trophy } from '../../../chunks/trophy.js-DzME18K8.js';
import { B as Badge } from '../../../chunks/Badge.js-Cc55HWA_.js';
import { C as Card } from '../../../chunks/Card.js--UQVbkC4.js';
import '../../../chunks/uneval.js-BE77gmoB.js';

//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/server.svelte
function Server($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "server" },
		props,
		{ iconNode: [
			["rect", {
				"width": "20",
				"height": "8",
				"x": "2",
				"y": "2",
				"rx": "2",
				"ry": "2"
			}],
			["rect", {
				"width": "20",
				"height": "8",
				"x": "2",
				"y": "14",
				"rx": "2",
				"ry": "2"
			}],
			["line", {
				"x1": "6",
				"x2": "6.01",
				"y1": "6",
				"y2": "6"
			}],
			["line", {
				"x1": "6",
				"x2": "6.01",
				"y1": "18",
				"y2": "18"
			}]
		] }
	]));
}
//#endregion
//#region src/routes/admin/+page.svelte
function _page($$renderer) {
	const stats = [
		{
			label: "Active players",
			value: "0",
			detail: "No event is live",
			icon: Activity
		},
		{
			label: "Submissions",
			value: "0",
			detail: "Last 15 minutes",
			icon: Radio
		},
		{
			label: "First bloods",
			value: "0",
			detail: "Across all modes",
			icon: Trophy
		},
		{
			label: "Instances",
			value: "—",
			detail: "Orchestration is off",
			icon: Server
		}
	];
	$$renderer.push(`<section class="page admin-page svelte-1jef3w8"><div class="split-header"><div><p class="eyebrow">Live operations</p> <h1 class="title">Quiet at the gate.</h1> <p class="lede">Event activity, submissions, instances, and system health converge here.</p></div> `);
	Badge($$renderer, {
		tone: "success",
		children: ($$renderer) => {
			$$renderer.push(`<!---->API healthy`);
		}});
	$$renderer.push(`<!----></div> <div class="stat-grid svelte-1jef3w8"><!--[-->`);
	const each_array = ensure_array_like(stats);
	for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
		let stat = each_array[$$index];
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<div class="stat-head svelte-1jef3w8">`);
				stat.icon($$renderer, { size: 17 });
				$$renderer.push(`<!----><span>${escape_html(stat.label)}</span></div> <strong class="svelte-1jef3w8">${escape_html(stat.value)}</strong> <small class="svelte-1jef3w8">${escape_html(stat.detail)}</small>`);
			}});
	}
	$$renderer.push(`<!--]--></div> `);
	Card($$renderer, {
		children: ($$renderer) => {
			$$renderer.push(`<div class="activity-head svelte-1jef3w8"><div><h2 class="svelte-1jef3w8">Event stream</h2> <p class="svelte-1jef3w8">Meaningful domain changes appear in real time.</p></div> `);
			Badge($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<!---->Waiting`);
				}});
			$$renderer.push(`<!----></div> <div class="quiet svelte-1jef3w8"><span class="svelte-1jef3w8"></span>No activity yet. The foxfire will stir when your event begins.</div>`);
		}});
	$$renderer.push(`<!----></section>`);
}

export { _page as default };
//# sourceMappingURL=_page.svelte.js-DwI--nBC.js.map
