import { T as escape_html } from '../../chunks/index-server.js-Chdi67Z_.js';
import { p as page } from '../../chunks/state.js-BES14lf9.js';
import { B as Button } from '../../chunks/Button.js-CFr2qd92.js';
import '../../chunks/uneval.js-BE77gmoB.js';
import '../../chunks/client.js-D-tcsb2s.js';
import '../../chunks/shared.js-CbPU9NeZ.js';
import '../../chunks/internal2.js-CZggGcqa.js';
import '../../chunks/legacy-client.js-bbVRxGAc.js';
import '../../chunks/exports.js-BLAmF2C8.js';
import '../../chunks/utils.js-Cx_V3aAX.js';

//#region src/routes/+error.svelte
function _error($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		$$renderer.push(`<section class="error-page svelte-1j96wlh"><div class="gate svelte-1j96wlh" aria-hidden="true"><span class="svelte-1j96wlh"></span><i></i><i></i></div> <p class="eyebrow svelte-1j96wlh">${escape_html(page.status)}</p> <h1 class="svelte-1j96wlh">${escape_html(page.status === 404 ? "This path slips beyond the torii." : "The trail went cold.")}</h1> <p class="svelte-1j96wlh">${escape_html(page.status === 404 ? "Nothing lives at this address." : "Kitsune recorded the failure. Try the gate again.")}</p> <a href="/">`);
		Button($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<!---->Return home`);
			}});
		$$renderer.push(`<!----></a></section>`);
	});
}

export { _error as default };
//# sourceMappingURL=_error.svelte.js-DpeA-IfL.js.map
