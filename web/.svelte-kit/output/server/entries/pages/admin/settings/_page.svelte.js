import { p as spread_props, s as derived, x as escape_html } from "../../../../chunks/index-server.js";
import { t as Icon } from "../../../../chunks/Icon.js";
import { i as en, n as preferences } from "../../../../chunks/index.svelte.js";
import { t as Badge } from "../../../../chunks/Badge.js";
import { t as Card } from "../../../../chunks/Card.js";
import { t as Toggle } from "../../../../chunks/Toggle.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/external-link.svelte
function External_link($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "external-link" },
		props,
		{ iconNode: [
			["path", { "d": "M15 3h6v6" }],
			["path", { "d": "M10 14 21 3" }],
			["path", { "d": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]
		] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/lock-keyhole.svelte
function Lock_keyhole($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "lock-keyhole" },
		props,
		{ iconNode: [
			["circle", {
				"cx": "12",
				"cy": "16",
				"r": "1"
			}],
			["rect", {
				"x": "3",
				"y": "10",
				"width": "18",
				"height": "12",
				"rx": "2"
			}],
			["path", { "d": "M7 10V7a5 5 0 0 1 10 0v3" }]
		] }
	]));
}
//#endregion
//#region src/routes/admin/settings/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let neutralTone = derived(() => preferences.tone === "professional");
		let branding = derived(() => preferences.branding);
		let whiteLabel = false;
		function setNeutral(value) {
			preferences.setTone(value ? "professional" : "kitsune");
		}
		function setBranding(value) {
			preferences.branding = value;
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer) {
			$$renderer.push(`<section class="page admin-page svelte-1gjcsm"><div class="split-header"><div><p class="eyebrow">Organization settings</p> <h1 class="title">Make Kitsune yours.</h1> <p class="lede">Features disappear cleanly when switched off. Sensible defaults remain until you choose
        otherwise.</p></div> `);
			Badge($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<!---->Lean profile`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----></div> <div class="settings-grid svelte-1gjcsm">`);
			Card($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<div class="section-head svelte-1gjcsm"><div><h2 class="svelte-1gjcsm">Voice &amp; identity</h2> <p class="svelte-1gjcsm">Copy tone and visual branding are separate controls.</p></div></div> <div class="rows svelte-1gjcsm">`);
					Toggle($$renderer, {
						checked: neutralTone(),
						onchange: setNeutral,
						label: "Neutral-professional copy",
						description: "Use plain wording throughout the product. The fox stays unless branding is disabled separately."
					});
					$$renderer.push(`<!----> `);
					Toggle($$renderer, {
						checked: branding(),
						onchange: setBranding,
						label: "Show Kitsune identity",
						description: "Show the wordmark and restrained mascot moments on authentication, loading, and result surfaces."
					});
					$$renderer.push(`<!----></div> `);
					if (!preferences.branding) {
						$$renderer.push("<!--[0-->");
						$$renderer.push(`<div class="nudge svelte-1gjcsm"><span>🦊</span> <p class="svelte-1gjcsm">${escape_html(en.branding.nudge)} <a href="https://github.com/sponsors/simonfalke-01" target="_blank" rel="noreferrer" class="svelte-1gjcsm">Support Kitsune `);
						External_link($$renderer, { size: 13 });
						$$renderer.push(`<!----></a></p></div>`);
					} else $$renderer.push("<!--[-1-->");
					$$renderer.push(`<!--]-->`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----> `);
			Card($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<div class="section-head svelte-1gjcsm"><div><h2 class="svelte-1gjcsm">Official white-label</h2> <p class="svelte-1gjcsm">One-click custom identity for supporter and enterprise installations.</p></div> `);
					Badge($$renderer, {
						tone: "accent",
						children: ($$renderer) => {
							Lock_keyhole($$renderer, { size: 12 });
							$$renderer.push(`<!----> Entitlement`);
						},
						$$slots: { default: true }
					});
					$$renderer.push(`<!----></div> `);
					Toggle($$renderer, {
						label: "Enable white-label",
						description: "Upload a custom logo, tune brand tokens, and remove the support nudge with the white_label capability.",
						disabled: true,
						get checked() {
							return whiteLabel;
						},
						set checked($$value) {
							whiteLabel = $$value;
							$$settled = false;
						}
					});
					$$renderer.push(`<!----> <p class="entitlement-note svelte-1gjcsm">This organization does not have the <code class="svelte-1gjcsm">white_label</code> entitlement. The free de-brand control
        above still works.</p>`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----> `);
			Card($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<div class="section-head svelte-1gjcsm"><div><h2 class="svelte-1gjcsm">Runtime profile</h2> <p class="svelte-1gjcsm">Lean keeps external services off. Full exposes each advanced subsystem independently.</p></div></div> <label class="field"><span>Profile</span><select>`);
					$$renderer.option({}, ($$renderer) => {
						$$renderer.push(`Lean — zero configuration`);
					});
					$$renderer.option({}, ($$renderer) => {
						$$renderer.push(`Full — advanced defaults`);
					});
					$$renderer.push(`</select></label>`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----></div></section>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer.subsume($$inner_renderer);
	});
}
//#endregion
export { _page as default };
