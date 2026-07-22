import { p as spread_props } from "./index-server.js";
import { t as Icon } from "./Icon.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/activity.svelte
function Activity($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "activity" },
		props,
		{ iconNode: [["path", { "d": "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" }]] }
	]));
}
//#endregion
export { Activity as t };
