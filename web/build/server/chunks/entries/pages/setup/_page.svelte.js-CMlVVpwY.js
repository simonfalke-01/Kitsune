import { S as head, T as escape_html, Q as attr } from '../../../chunks/index-server.js-Chdi67Z_.js';
import '../../../chunks/client.js-D-tcsb2s.js';
import { A as Arrow_right } from '../../../chunks/arrow-right.js-gltrHsbk.js';
import { t as toned, c as copy } from '../../../chunks/index.svelte.js-BSj0vCZL.js';
import { B as BrandMark } from '../../../chunks/BrandMark.js-BjNG7omJ.js';
import { B as Button } from '../../../chunks/Button.js-CFr2qd92.js';
import { s as session } from '../../../chunks/session.svelte.js-Jv6BIpyL.js';
import { C as Card } from '../../../chunks/Card.js--UQVbkC4.js';
import '../../../chunks/uneval.js-BE77gmoB.js';
import '../../../chunks/shared.js-CbPU9NeZ.js';
import '../../../chunks/internal2.js-CZggGcqa.js';
import '../../../chunks/legacy-client.js-bbVRxGAc.js';
import '../../../chunks/exports.js-BLAmF2C8.js';
import '../../../chunks/utils.js-Cx_V3aAX.js';
import '../../../chunks/Icon.js-7T_iTbUI.js';
import 'openapi-fetch';

//#endregion
//#region src/routes/setup/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let organizationName = "";
		let organizationSlug = "";
		let displayName = "";
		let email = "";
		let password = "";
		head("g40i6i", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Set up Kitsune</title>`);
			});
		});
		$$renderer.push(`<div class="page page-narrow setup svelte-g40i6i">`);
		BrandMark($$renderer, {});
		$$renderer.push(`<!----> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<header class="svelte-g40i6i"><p class="eyebrow">First light</p> <h1 class="title">${escape_html(toned(copy("auth").setupTitle))}</h1> <p class="lede">One owner account is all Kitsune needs. Everything else stays optional.</p></header> `);
		Card($$renderer, {
			elevated: true,
			children: ($$renderer) => {
				$$renderer.push(`<form class="svelte-g40i6i"><div class="pair svelte-g40i6i"><label class="field"><span>Organization name</span> <input${attr("value", organizationName)} required="" autocomplete="organization"/></label> <label class="field"><span>Organization key</span> <input${attr("value", organizationSlug)} required="" pattern="[a-z0-9][a-z0-9-]{0,62}"/></label></div> <label class="field"><span>Your name</span> <input${attr("value", displayName)} required="" autocomplete="name"/></label> <label class="field"><span>Email</span> <input${attr("value", email)} type="email" required="" autocomplete="username"/></label> <label class="field"><span>Password</span> <input${attr("value", password)} type="password" required="" minlength="12" maxlength="128" autocomplete="new-password"/> <small class="field-hint">At least 12 characters. A passphrase works beautifully.</small></label> `);
				if (session.error) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<p class="error-text" role="alert">${escape_html(session.error)}</p>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--> `);
				Button($$renderer, {
					type: "submit",
					loading: session.loading,
					children: ($$renderer) => {
						$$renderer.push(`<!---->Create Kitsune `);
						Arrow_right($$renderer, { size: 15 });
						$$renderer.push(`<!---->`);
					}});
				$$renderer.push(`<!----></form>`);
			}});
		$$renderer.push(`<!---->`);
		$$renderer.push(`<!--]--></div>`);
	});
}

export { _page as default };
//# sourceMappingURL=_page.svelte.js-CMlVVpwY.js.map
