import { l as ensure_array_like, p as spread_props, u as head, v as attr, x as escape_html } from "../../chunks/index-server.js";
import { t as goto } from "../../chunks/client.js";
import { t as page } from "../../chunks/state.js";
import "../../chunks/navigation.js";
import { t as Icon } from "../../chunks/Icon.js";
import { n as preferences } from "../../chunks/index.svelte.js";
import { t as BrandMark } from "../../chunks/BrandMark.js";
import { t as Button } from "../../chunks/Button.js";
import { t as session } from "../../chunks/session.svelte.js";
import { t as realtime } from "../../chunks/realtime.svelte.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/log-out.svelte
function Log_out($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "log-out" },
		props,
		{ iconNode: [
			["path", { "d": "m16 17 5-5-5-5" }],
			["path", { "d": "M21 12H9" }],
			["path", { "d": "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }]
		] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/moon.svelte
function Moon($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "moon" },
		props,
		{ iconNode: [["path", { "d": "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" }]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/shield-check.svelte
function Shield_check($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "shield-check" },
		props,
		{ iconNode: [["path", { "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { "d": "m9 12 2 2 4-4" }]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/sun.svelte
function Sun($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "sun" },
		props,
		{ iconNode: [
			["circle", {
				"cx": "12",
				"cy": "12",
				"r": "4"
			}],
			["path", { "d": "M12 2v2" }],
			["path", { "d": "M12 20v2" }],
			["path", { "d": "m4.93 4.93 1.41 1.41" }],
			["path", { "d": "m17.66 17.66 1.41 1.41" }],
			["path", { "d": "M2 12h2" }],
			["path", { "d": "M20 12h2" }],
			["path", { "d": "m6.34 17.66-1.41 1.41" }],
			["path", { "d": "m19.07 4.93-1.41 1.41" }]
		] }
	]));
}
//#endregion
//#region src/lib/components/AppHeader.svelte
function AppHeader($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const links = [
			{
				href: "/challenges",
				label: "Challenges"
			},
			{
				href: "/scoreboard",
				label: "Scoreboard"
			},
			{
				href: "/team",
				label: "Team"
			}
		];
		async function signOut() {
			realtime.stop();
			await session.logout();
			await goto("/login");
		}
		$$renderer.push(`<header class="header svelte-isll26"><a class="brand-link svelte-isll26" href="/" aria-label="Kitsune home">`);
		BrandMark($$renderer, {});
		$$renderer.push(`<!----></a> `);
		if (session.authenticated) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<nav aria-label="Primary navigation" class="svelte-isll26"><!--[-->`);
			const each_array = ensure_array_like(links);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let link = each_array[$$index];
				$$renderer.push(`<a${attr("href", link.href)}${attr("aria-current", page.url.pathname.startsWith(link.href) ? "page" : void 0)} class="svelte-isll26">${escape_html(link.label)}</a>`);
			}
			$$renderer.push(`<!--]--> `);
			if (session.can("event_manage")) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<a href="/admin"${attr("aria-current", page.url.pathname.startsWith("/admin") ? "page" : void 0)} class="svelte-isll26">`);
				Shield_check($$renderer, { size: 14 });
				$$renderer.push(`<!---->Admin</a>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></nav>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <div class="actions svelte-isll26"><button class="icon-button svelte-isll26" type="button"${attr("aria-label", preferences.theme === "dark" ? "Use light theme" : "Use dark theme")}>`);
		if (preferences.theme === "dark") {
			$$renderer.push("<!--[0-->");
			Sun($$renderer, { size: 17 });
		} else {
			$$renderer.push("<!--[-1-->");
			Moon($$renderer, { size: 17 });
		}
		$$renderer.push(`<!--]--></button> `);
		if (session.authenticated) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<span class="identity svelte-isll26">${escape_html(session.current?.user.display_name)}</span> `);
			Button($$renderer, {
				variant: "quiet",
				ariaLabel: "Sign out",
				onclick: signOut,
				children: ($$renderer) => {
					Log_out($$renderer, { size: 16 });
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!---->`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<a class="sign-in svelte-isll26" href="/login">Sign in</a>`);
		}
		$$renderer.push(`<!--]--></div></header>`);
	});
}
//#endregion
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { children } = $$props;
		head("12qhfyh", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Kitsune — Outfox the challenge</title>`);
			});
			$$renderer.push(`<meta name="description" content="A fast, robust platform for Jeopardy, King of the Hill, Attack/Defense, and workshops."/>`);
		});
		AppHeader($$renderer, {});
		$$renderer.push(`<!----> <main>`);
		children($$renderer);
		$$renderer.push(`<!----></main>`);
	});
}
//#endregion
export { _layout as default };
