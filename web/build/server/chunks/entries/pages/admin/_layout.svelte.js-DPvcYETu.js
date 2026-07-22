import { N as ensure_array_like, Q as attr, T as escape_html, U as spread_props } from '../../../chunks/index-server.js-Chdi67Z_.js';
import '../../../chunks/client.js-D-tcsb2s.js';
import { p as page } from '../../../chunks/state.js-BES14lf9.js';
import { I as Icon } from '../../../chunks/Icon.js-7T_iTbUI.js';
import { A as Activity } from '../../../chunks/activity.js-DOaWs1WE.js';
import { S as Sparkles } from '../../../chunks/sparkles.js-D54cNOEq.js';
import '../../../chunks/session.svelte.js-Jv6BIpyL.js';
import '../../../chunks/uneval.js-BE77gmoB.js';
import '../../../chunks/shared.js-CbPU9NeZ.js';
import '../../../chunks/internal2.js-CZggGcqa.js';
import '../../../chunks/legacy-client.js-bbVRxGAc.js';
import '../../../chunks/exports.js-BLAmF2C8.js';
import '../../../chunks/utils.js-Cx_V3aAX.js';
import 'openapi-fetch';

//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/blocks.svelte
function Blocks($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "blocks" },
		props,
		{ iconNode: [["path", { "d": "M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" }], ["rect", {
			"x": "14",
			"y": "2",
			"width": "8",
			"height": "8",
			"rx": "1"
		}]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/settings-2.svelte
function Settings_2($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "settings-2" },
		props,
		{ iconNode: [
			["path", { "d": "M14 17H5" }],
			["path", { "d": "M19 7h-9" }],
			["circle", {
				"cx": "17",
				"cy": "17",
				"r": "3"
			}],
			["circle", {
				"cx": "7",
				"cy": "7",
				"r": "3"
			}]
		] }
	]));
}
//#endregion
//#region src/routes/admin/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { children } = $$props;
		const links = [
			{
				href: "/admin",
				label: "Live operations",
				icon: Activity
			},
			{
				href: "/admin/challenges",
				label: "Challenges",
				icon: Blocks
			},
			{
				href: "/admin/automation",
				label: "Automation",
				icon: Sparkles
			},
			{
				href: "/admin/settings",
				label: "Settings",
				icon: Settings_2
			}
		];
		$$renderer.push(`<div class="admin-shell svelte-1qg5d05"><aside aria-label="Organizer navigation" class="svelte-1qg5d05"><p class="svelte-1qg5d05">Organizer</p> <!--[-->`);
		const each_array = ensure_array_like(links);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let item = each_array[$$index];
			$$renderer.push(`<a${attr("href", item.href)}${attr("aria-current", item.href === "/admin" ? page.url.pathname === item.href ? "page" : void 0 : page.url.pathname.startsWith(item.href) ? "page" : void 0)} class="svelte-1qg5d05">`);
			if (item.icon) {
				$$renderer.push("<!--[-->");
				item.icon($$renderer, { size: 16 });
				$$renderer.push("<!--]-->");
			} else {
				$$renderer.push("<!--[!-->");
				$$renderer.push("<!--]-->");
			}
			$$renderer.push(`${escape_html(item.label)}</a>`);
		}
		$$renderer.push(`<!--]--></aside> <div class="admin-content svelte-1qg5d05">`);
		children($$renderer);
		$$renderer.push(`<!----></div></div>`);
	});
}

export { _layout as default };
//# sourceMappingURL=_layout.svelte.js-DPvcYETu.js.map
