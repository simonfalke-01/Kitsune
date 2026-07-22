import { S as head, U as spread_props } from '../../../chunks/index-server.js-Chdi67Z_.js';
import { I as Icon } from '../../../chunks/Icon.js-7T_iTbUI.js';
import { E as EmptyState } from '../../../chunks/EmptyState.js-C1hM-P9d.js';
import { C as Card } from '../../../chunks/Card.js--UQVbkC4.js';
import '../../../chunks/uneval.js-BE77gmoB.js';

//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/copy.svelte
function Copy($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "copy" },
		props,
		{ iconNode: [["rect", {
			"width": "14",
			"height": "14",
			"x": "8",
			"y": "8",
			"rx": "2",
			"ry": "2"
		}], ["path", { "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/crown.svelte
function Crown($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "crown" },
		props,
		{ iconNode: [["path", { "d": "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" }], ["path", { "d": "M5 21h14" }]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/users.svelte
function Users($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "users" },
		props,
		{ iconNode: [
			["path", { "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
			["path", { "d": "M16 3.128a4 4 0 0 1 0 7.744" }],
			["path", { "d": "M22 21v-2a4 4 0 0 0-3-3.87" }],
			["circle", {
				"cx": "9",
				"cy": "7",
				"r": "4"
			}]
		] }
	]));
}
//#endregion
//#region src/routes/team/+page.svelte
function _page($$renderer) {
	head("1cobqru", $$renderer, ($$renderer) => {
		$$renderer.title(($$renderer) => {
			$$renderer.push(`<title>Team — Kitsune</title>`);
		});
	});
	$$renderer.push(`<div class="page"><p class="eyebrow">Identity</p> <h1 class="title">Your team</h1> <p class="lede">Captain controls, invitations, and roster changes live here.</p> <div class="team-space svelte-1cobqru">`);
	{
		function action($$renderer) {
			$$renderer.push(`<span class="hint svelte-1cobqru">`);
			Users($$renderer, { size: 16 });
			$$renderer.push(`<!----> Team membership is event-aware.</span>`);
		}
		EmptyState($$renderer, {
			title: "You have not joined a team.",
			detail: "Create one or enter an invite code when the event opens team registration.",
			action});
	}
	$$renderer.push(`<!----></div> <div class="reference grid grid-3 svelte-1cobqru" aria-label="Team capabilities">`);
	Card($$renderer, {
		children: ($$renderer) => {
			Crown($$renderer, { size: 17 });
			$$renderer.push(`<!----> <h2>Captain controls</h2> <p>Invite, approve, remove, and transfer leadership.</p>`);
		}});
	$$renderer.push(`<!----> `);
	Card($$renderer, {
		children: ($$renderer) => {
			Copy($$renderer, { size: 17 });
			$$renderer.push(`<!----> <h2>Private invite codes</h2> <p>Rotatable codes are stored as one-way digests.</p>`);
		}});
	$$renderer.push(`<!----> `);
	Card($$renderer, {
		children: ($$renderer) => {
			Users($$renderer, { size: 17 });
			$$renderer.push(`<!----> <h2>Clear limits</h2> <p>Size policies are visible before anyone joins.</p>`);
		}});
	$$renderer.push(`<!----></div></div>`);
}

export { _page as default };
//# sourceMappingURL=_page.svelte.js-QUMLaog1.js.map
