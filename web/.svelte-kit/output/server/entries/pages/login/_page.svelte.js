import { p as spread_props, u as head, v as attr, x as escape_html } from "../../../chunks/index-server.js";
import "../../../chunks/navigation.js";
import { t as Icon } from "../../../chunks/Icon.js";
import { t as Radio } from "../../../chunks/radio.js";
import { r as toned, t as copy } from "../../../chunks/index.svelte.js";
import { t as BrandMark } from "../../../chunks/BrandMark.js";
import { t as Button } from "../../../chunks/Button.js";
import { t as session } from "../../../chunks/session.svelte.js";
import "../../../chunks/realtime.svelte.js";
import { t as Card } from "../../../chunks/Card.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/key-round.svelte
function Key_round($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "key-round" },
		props,
		{ iconNode: [["path", { "d": "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" }], ["circle", {
			"cx": "16.5",
			"cy": "7.5",
			"r": ".5",
			"fill": "currentColor"
		}]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/scan-face.svelte
function Scan_face($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "scan-face" },
		props,
		{ iconNode: [
			["path", { "d": "M3 7V5a2 2 0 0 1 2-2h2" }],
			["path", { "d": "M17 3h2a2 2 0 0 1 2 2v2" }],
			["path", { "d": "M21 17v2a2 2 0 0 1-2 2h-2" }],
			["path", { "d": "M7 21H5a2 2 0 0 1-2-2v-2" }],
			["path", { "d": "M8 14s1.5 2 4 2 4-2 4-2" }],
			["path", { "d": "M9 9h.01" }],
			["path", { "d": "M15 9h.01" }]
		] }
	]));
}
//#endregion
//#region src/routes/login/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let organization = "";
		let email = "";
		let password = "";
		head("1x05zx6", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Sign in — Kitsune</title>`);
			});
		});
		$$renderer.push(`<div class="auth-shell svelte-1x05zx6"><section class="auth-intro svelte-1x05zx6">`);
		BrandMark($$renderer, {});
		$$renderer.push(`<!----> <div class="svelte-1x05zx6"><p class="eyebrow svelte-1x05zx6">Welcome back</p> <h1 class="svelte-1x05zx6">${escape_html(toned(copy("auth").welcome))}</h1> <p class="svelte-1x05zx6">${escape_html(toned(copy("auth").intro))}</p></div> <p class="footnote svelte-1x05zx6">Kitsune keeps external identity optional. Local accounts always work.</p></section> `);
		Card($$renderer, {
			elevated: true,
			children: ($$renderer) => {
				$$renderer.push(`<form class="svelte-1x05zx6"><header class="svelte-1x05zx6"><h2 class="svelte-1x05zx6">Sign in</h2> <p class="svelte-1x05zx6">Use the organization key your organizer shared.</p></header> <label class="field"><span>Organization</span> <input${attr("value", organization)} autocomplete="organization" required="" placeholder="night-shrine"/></label> <label class="field"><span>Email</span> <input${attr("value", email)} type="email" autocomplete="username" required="" placeholder="you@example.com"/></label> <label class="field"><span>Password</span> <input${attr("value", password)} type="password" autocomplete="current-password" required=""/></label> `);
				if (session.error) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<p class="error-text" role="alert">${escape_html(session.error)}</p>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--> `);
				Button($$renderer, {
					type: "submit",
					loading: session.loading,
					children: ($$renderer) => {
						Key_round($$renderer, { size: 16 });
						$$renderer.push(`<!----> Sign in`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!----> <div class="alternatives svelte-1x05zx6" aria-label="Other sign-in methods"><button type="button" disabled="" title="Available when passkeys are configured" class="svelte-1x05zx6">`);
				Scan_face($$renderer, { size: 15 });
				$$renderer.push(`<!----> Passkey</button> <button type="button" disabled="" title="Available when SSO is configured" class="svelte-1x05zx6">`);
				Radio($$renderer, { size: 15 });
				$$renderer.push(`<!----> SSO</button></div> <a class="recovery svelte-1x05zx6" href="/recover">Recover your account</a></form>`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!----></div>`);
	});
}
//#endregion
export { _page as default };
