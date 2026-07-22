import { p as spread_props } from "./index-server.js";
import { t as Icon } from "./Icon.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/arrow-right.svelte
function Arrow_right($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "arrow-right" },
		props,
		{ iconNode: [["path", { "d": "M5 12h14" }], ["path", { "d": "m12 5 7 7-7 7" }]] }
	]));
}
//#endregion
export { Arrow_right as t };
