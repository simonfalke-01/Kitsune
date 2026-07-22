import { B as BrandMark } from '../../../chunks/BrandMark.js-BjNG7omJ.js';
import { B as Button } from '../../../chunks/Button.js-CFr2qd92.js';
import { B as Badge } from '../../../chunks/Badge.js-Cc55HWA_.js';
import { C as Card } from '../../../chunks/Card.js--UQVbkC4.js';
import { T as Toggle } from '../../../chunks/Toggle.js-C2aXvyV2.js';
import '../../../chunks/index.svelte.js-BSj0vCZL.js';
import '../../../chunks/index-server.js-Chdi67Z_.js';
import '../../../chunks/uneval.js-BE77gmoB.js';

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
			}});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Actions</h2> <div class="sample wrap svelte-1nlqszj">`);
				Button($$renderer, {
					children: ($$renderer) => {
						$$renderer.push(`<!---->Primary`);
					}});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					variant: "secondary",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Secondary`);
					}});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					variant: "quiet",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Quiet`);
					}});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					variant: "danger",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Danger`);
					}});
				$$renderer.push(`<!----></div>`);
			}});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Status</h2> <div class="sample wrap svelte-1nlqszj">`);
				Badge($$renderer, {
					children: ($$renderer) => {
						$$renderer.push(`<!---->Neutral`);
					}});
				$$renderer.push(`<!---->`);
				Badge($$renderer, {
					tone: "success",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Healthy`);
					}});
				$$renderer.push(`<!---->`);
				Badge($$renderer, {
					tone: "warning",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Waiting`);
					}});
				$$renderer.push(`<!---->`);
				Badge($$renderer, {
					tone: "accent",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Foxfire`);
					}});
				$$renderer.push(`<!----></div>`);
			}});
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
			}});
		$$renderer.push(`<!----> `);
		Card($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<h2 class="svelte-1nlqszj">Color tokens</h2> <div class="swatches svelte-1nlqszj"><span class="accent svelte-1nlqszj">Accent</span><span class="foxfire svelte-1nlqszj">Foxfire</span><span class="surface svelte-1nlqszj">Surface</span><span class="muted-token svelte-1nlqszj">Muted</span></div>`);
			}});
		$$renderer.push(`<!----></div></section>`);
	}
	do {
		$$settled = true;
		$$inner_renderer = $$renderer.copy();
		$$render_inner($$inner_renderer);
	} while (!$$settled);
	$$renderer.subsume($$inner_renderer);
}

export { _page as default };
//# sourceMappingURL=_page.svelte.js-Diyx-HHm.js.map
