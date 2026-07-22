import { P as attr_class } from './index-server.js-Chdi67Z_.js';

//#region src/lib/components/Card.svelte
function Card($$renderer, $$props) {
	let { children, padded = true, elevated = false } = $$props;
	$$renderer.push(`<div${attr_class("card svelte-1udyrqm", void 0, {
		"padded": padded,
		"elevated": elevated
	})}>`);
	children($$renderer);
	$$renderer.push(`<!----></div>`);
}

export { Card as C };
//# sourceMappingURL=Card.js--UQVbkC4.js.map
