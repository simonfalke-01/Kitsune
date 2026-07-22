import "../../../chunks/index-server.js";
import { t as BrandMark } from "../../../chunks/BrandMark.js";
import { t as Button } from "../../../chunks/Button.js";
import { t as Badge } from "../../../chunks/Badge.js";
import { t as Card } from "../../../chunks/Card.js";
import { t as Toggle } from "../../../chunks/Toggle.js";
//#region src/routes/design-system/+page.svelte
function _page($$renderer) {
	let switched = true;
	let $$settled = true;
	let $$inner_renderer;
	function $$render_inner($$renderer) {
		$$renderer.push(`<section class="page"><p class="eyebrow">Kitsune design system</p> <h1 class="title">Quiet confidence, clear intent.</h1> <p class="lede">Tokens, primitives, and interaction rules shared by every mode and extension surface.</p> <div class="catalog svelte-1nlqszj">`);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Identity</h2> <div class="sample svelte-1nlqszj">`);
				BrandMark($$renderer, {});
				$$renderer.push(`<!----></div>`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Actions</h2> <div class="sample wrap svelte-1nlqszj">`);
				Button($$renderer, {
					children: ($$renderer) => {
						$$renderer.push(`<!---->Primary`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					variant: "secondary",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Secondary`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					variant: "quiet",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Quiet`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					variant: "danger",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Danger`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!----></div>`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Status</h2> <div class="sample wrap svelte-1nlqszj">`);
				Badge($$renderer, {
					children: ($$renderer) => {
						$$renderer.push(`<!---->Neutral`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Badge($$renderer, {
					tone: "success",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Healthy`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Badge($$renderer, {
					tone: "warning",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Waiting`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Badge($$renderer, {
					tone: "accent",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Foxfire`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!----></div>`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Controls</h2> <div class="sample svelte-1nlqszj">`);
				Toggle($$renderer, {
					label: "Example capability",
					description: "Headless and keyboard-accessible through Bits UI.",
					get checked() {
						return switched;
					},
					set checked($$value) {
						switched = $$value;
						$$settled = false;
					}
				});
				$$renderer.push(`<!----></div>`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Color tokens</h2> <div class="swatches svelte-1nlqszj"><span class="accent svelte-1nlqszj">Accent</span><span class="foxfire svelte-1nlqszj">Foxfire</span><span class="surface svelte-1nlqszj">Surface</span><span class="muted-token svelte-1nlqszj">Muted</span></div>`);
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
}
//#endregion
export { _page as default };
