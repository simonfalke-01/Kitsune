import { p as spread_props, v as attr } from "../../../../chunks/index-server.js";
import { t as Icon } from "../../../../chunks/Icon.js";
import { t as Plus } from "../../../../chunks/plus.js";
import { t as EmptyState } from "../../../../chunks/EmptyState.js";
import { t as Button } from "../../../../chunks/Button.js";
import { t as Card } from "../../../../chunks/Card.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/upload.svelte
function Upload($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "upload" },
		props,
		{ iconNode: [
			["path", { "d": "M12 3v12" }],
			["path", { "d": "m17 8-5-5-5 5" }],
			["path", { "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }]
		] }
	]));
}
//#endregion
//#region src/routes/admin/challenges/+page.svelte
function _page($$renderer) {
	let showComposer = false;
	let title = "";
	let category = "Web";
	let challengeType = "static-flag";
	let points = 500;
	$$renderer.push(`<section class="page admin-page svelte-v6xodj"><div class="split-header"><div><p class="eyebrow">Challenge authoring</p> <h1 class="title">Build the next trick.</h1> <p class="lede">Author in the browser or bring a validated <code class="svelte-v6xodj">challenge.yml</code>.</p></div> <div class="actions svelte-v6xodj">`);
	Button($$renderer, {
		variant: "secondary",
		children: ($$renderer) => {
			Upload($$renderer, { size: 16 });
			$$renderer.push(`<!---->Import YAML`);
		},
		$$slots: { default: true }
	});
	$$renderer.push(`<!----> `);
	Button($$renderer, {
		onclick: () => showComposer = !showComposer,
		children: ($$renderer) => {
			Plus($$renderer, { size: 16 });
			$$renderer.push(`<!---->New challenge`);
		},
		$$slots: { default: true }
	});
	$$renderer.push(`<!----></div></div> `);
	if (showComposer) {
		$$renderer.push("<!--[0-->");
		Card($$renderer, {
			elevated: true,
			children: ($$renderer) => {
				$$renderer.push(`<form><div class="form-head svelte-v6xodj"><h2 class="svelte-v6xodj">Untitled challenge</h2> <span class="svelte-v6xodj">Draft</span></div> <div class="form-grid svelte-v6xodj"><label class="field"><span>Title</span><input${attr("value", title)} required="" placeholder="The disappearing endpoint"/></label> <label class="field"><span>Category</span><input${attr("value", category)} required=""/></label> <label class="field"><span>Type</span>`);
				$$renderer.select({ value: challengeType }, ($$renderer) => {
					$$renderer.option({ value: "static-flag" }, ($$renderer) => {
						$$renderer.push(`Static flag`);
					});
					$$renderer.option({ value: "regex" }, ($$renderer) => {
						$$renderer.push(`Regex / multiple answer`);
					});
					$$renderer.option({ value: "multiple-choice" }, ($$renderer) => {
						$$renderer.push(`Multiple choice`);
					});
					$$renderer.option({ value: "dynamic" }, ($$renderer) => {
						$$renderer.push(`Per-team instance`);
					});
					$$renderer.option({ value: "remote" }, ($$renderer) => {
						$$renderer.push(`Remote service`);
					});
					$$renderer.option({ value: "manual" }, ($$renderer) => {
						$$renderer.push(`Manual verification`);
					});
				});
				$$renderer.push(`</label> <label class="field"><span>Starting points</span><input type="number" min="0"${attr("value", points)}/></label> <label class="field wide svelte-v6xodj"><span>Description</span><textarea rows="7" placeholder="Give players a clear trailhead without giving away the path." class="svelte-v6xodj"></textarea></label> <label class="field wide svelte-v6xodj"><span>Accepted answer</span><input type="password" autocomplete="new-password" placeholder="kit{...}"/></label></div> <div class="form-actions svelte-v6xodj">`);
				Button($$renderer, {
					variant: "quiet",
					onclick: () => showComposer = false,
					children: ($$renderer) => {
						$$renderer.push(`<!---->Cancel`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!---->`);
				Button($$renderer, {
					type: "submit",
					children: ($$renderer) => {
						$$renderer.push(`<!---->Save draft`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!----></div></form>`);
			},
			$$slots: { default: true }
		});
	} else {
		$$renderer.push("<!--[-1-->");
		{
			function action($$renderer) {
				Button($$renderer, {
					onclick: () => showComposer = true,
					children: ($$renderer) => {
						Plus($$renderer, { size: 16 });
						$$renderer.push(`<!---->Create challenge`);
					},
					$$slots: { default: true }
				});
			}
			EmptyState($$renderer, {
				title: "No challenges authored",
				detail: "Open the composer or import your ctfcli-compatible challenge collection.",
				action,
				$$slots: { action: true }
			});
		}
	}
	$$renderer.push(`<!--]--></section>`);
}
//#endregion
export { _page as default };
