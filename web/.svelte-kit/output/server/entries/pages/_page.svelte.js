import { p as spread_props, x as escape_html } from "../../chunks/index-server.js";
import { t as Icon } from "../../chunks/Icon.js";
import { t as Arrow_right } from "../../chunks/arrow-right.js";
import { t as Radio } from "../../chunks/radio.js";
import { t as EmptyState } from "../../chunks/EmptyState.js";
import { t as Sparkles } from "../../chunks/sparkles.js";
import { r as toned, t as copy } from "../../chunks/index.svelte.js";
import { t as session } from "../../chunks/session.svelte.js";
import { t as realtime } from "../../chunks/realtime.svelte.js";
import { t as Badge } from "../../chunks/Badge.js";
import { t as Card } from "../../chunks/Card.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/shield.svelte
function Shield($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "shield" },
		props,
		{ iconNode: [["path", { "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }]] }
	]));
}
//#endregion
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/workflow.svelte
function Workflow($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "workflow" },
		props,
		{ iconNode: [
			["rect", {
				"width": "8",
				"height": "8",
				"x": "3",
				"y": "3",
				"rx": "2"
			}],
			["path", { "d": "M7 11v4a2 2 0 0 0 2 2h4" }],
			["rect", {
				"width": "8",
				"height": "8",
				"x": "13",
				"y": "13",
				"rx": "2"
			}]
		] }
	]));
}
//#endregion
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		if (session.loading) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="loading svelte-1uha8ag" role="status" aria-live="polite"><span class="svelte-1uha8ag"></span> <p>Opening the gate…</p></div>`);
		} else if (session.authenticated) {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`<div class="page"><div class="split-header"><div><p class="eyebrow">Command center</p> <h1 class="title">Good hunting, ${escape_html(session.current?.user.display_name)}.</h1> <p class="lede">Your next event will appear here as soon as an organizer opens the gate.</p></div> `);
			Badge($$renderer, {
				tone: realtime.connected ? "success" : "warning",
				children: ($$renderer) => {
					Radio($$renderer, { size: 11 });
					$$renderer.push(`<!----> ${escape_html(realtime.connected ? "Live" : "Reconnecting")}`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----></div> <div class="quick grid grid-3 svelte-1uha8ag" aria-label="Quick actions"><a href="/challenges" class="svelte-1uha8ag">`);
			Sparkles($$renderer, { size: 18 });
			$$renderer.push(`<!----><span>Challenge board</span>`);
			Arrow_right($$renderer, { size: 15 });
			$$renderer.push(`<!----></a> <a href="/scoreboard" class="svelte-1uha8ag">`);
			Shield($$renderer, { size: 18 });
			$$renderer.push(`<!----><span>Live scoreboard</span>`);
			Arrow_right($$renderer, { size: 15 });
			$$renderer.push(`<!----></a> `);
			if (session.can("automation_manage")) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<a href="/admin/automation" class="svelte-1uha8ag">`);
				Workflow($$renderer, { size: 18 });
				$$renderer.push(`<!----><span>Automations</span>`);
				Arrow_right($$renderer, { size: 15 });
				$$renderer.push(`<!----></a>`);
			} else {
				$$renderer.push("<!--[-1-->");
				$$renderer.push(`<a href="/team" class="svelte-1uha8ag">`);
				Shield($$renderer, { size: 18 });
				$$renderer.push(`<!----><span>Your team</span>`);
				Arrow_right($$renderer, { size: 15 });
				$$renderer.push(`<!----></a>`);
			}
			$$renderer.push(`<!--]--></div> <div class="event-empty svelte-1uha8ag">`);
			EmptyState($$renderer, {
				title: toned(copy("empty").event),
				detail: "Organizers can create an event from Admin."
			});
			$$renderer.push(`<!----></div></div>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<section class="hero svelte-1uha8ag"><div class="hero-copy svelte-1uha8ag"><p class="eyebrow">Capture the flag, reimagined</p> <h1 class="display">Cunning wins the night.</h1> <p class="lede">Jeopardy, King of the Hill, Attack/Defense, and whatever game you invent next—one calm, fast
        platform built to stay out of your way.</p> <div class="hero-actions svelte-1uha8ag"><a class="primary-link svelte-1uha8ag" href="/login">Enter Kitsune `);
			Arrow_right($$renderer, { size: 16 });
			$$renderer.push(`<!----></a> <a class="secondary-link svelte-1uha8ag" href="/setup">Set up an event</a></div></div> <div class="principles svelte-1uha8ag">`);
			Card($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<span class="number svelte-1uha8ag">01</span> <h2 class="svelte-1uha8ag">Fast by default.</h2> <p class="svelte-1uha8ag">Realtime boards and focused interactions without dashboard noise.</p>`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----> `);
			Card($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<span class="number svelte-1uha8ag">02</span> <h2 class="svelte-1uha8ag">Every battery included.</h2> <p class="svelte-1uha8ag">Start lean in a minute. Reveal orchestration, automation, and A&amp;D when needed.</p>`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----> `);
			Card($$renderer, {
				children: ($$renderer) => {
					$$renderer.push(`<span class="number svelte-1uha8ag">03</span> <h2 class="svelte-1uha8ag">Built to shapeshift.</h2> <p class="svelte-1uha8ag">Typed events, safe plugins, themes, APIs, and game modes from one coherent core.</p>`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----></div></section>`);
		}
		$$renderer.push(`<!--]-->`);
	});
}
//#endregion
export { _page as default };
