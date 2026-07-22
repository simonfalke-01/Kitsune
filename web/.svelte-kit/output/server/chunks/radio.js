import { p as spread_props } from "./index-server.js";
import { t as Icon } from "./Icon.js";
//#region ../node_modules/.pnpm/@lucide+svelte@1.25.0_svelte@5.56.7_@typescript-eslint+types@8.65.0_/node_modules/@lucide/svelte/dist/icons/radio.svelte
function Radio($$renderer, $$props) {
	let { $$slots, $$events, ...props } = $$props;
	Icon($$renderer, spread_props([
		{ name: "radio" },
		props,
		{ iconNode: [
			["path", { "d": "M16.247 7.761a6 6 0 0 1 0 8.478" }],
			["path", { "d": "M19.075 4.933a10 10 0 0 1 0 14.134" }],
			["path", { "d": "M4.925 19.067a10 10 0 0 1 0-14.134" }],
			["path", { "d": "M7.753 16.239a6 6 0 0 1 0-8.478" }],
			["circle", {
				"cx": "12",
				"cy": "12",
				"r": "2"
			}]
		] }
	]));
}
//#endregion
export { Radio as t };
