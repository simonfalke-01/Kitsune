const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.BsjdhB7I.js",app:"_app/immutable/entry/app.BQts4GNd.js",imports:["_app/immutable/entry/start.BsjdhB7I.js","_app/immutable/chunks/Chx-d1Xp.js","_app/immutable/chunks/BHrCjTxw.js","_app/immutable/entry/app.BQts4GNd.js","_app/immutable/chunks/BHrCjTxw.js","_app/immutable/chunks/xihTtKlq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js-Ck8eXtqa.js')),
			__memo(() => import('./nodes/1.js-7r9oEc9M.js')),
			__memo(() => import('./nodes/2.js-C-IBgGcN.js')),
			__memo(() => import('./nodes/3.js-Dxw5PwRI.js')),
			__memo(() => import('./nodes/4.js-CxhzXDx7.js')),
			__memo(() => import('./nodes/5.js-BUQ2Wso6.js')),
			__memo(() => import('./nodes/6.js-DH952E8K.js')),
			__memo(() => import('./nodes/7.js-CR0LGuXb.js')),
			__memo(() => import('./nodes/8.js-Cc9L0YwC.js')),
			__memo(() => import('./nodes/9.js-D-48JLLJ.js')),
			__memo(() => import('./nodes/10.js-BwIJpM5-.js')),
			__memo(() => import('./nodes/11.js-iaA64Wzq.js')),
			__memo(() => import('./nodes/12.js-l57seVGV.js')),
			__memo(() => import('./nodes/13.js-D4UxbE-X.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/admin",
				pattern: /^\/admin\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/admin/automation",
				pattern: /^\/admin\/automation\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/admin/challenges",
				pattern: /^\/admin\/challenges\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/admin/settings",
				pattern: /^\/admin\/settings\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/challenges",
				pattern: /^\/challenges\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/design-system",
				pattern: /^\/design-system\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/scoreboard",
				pattern: /^\/scoreboard\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 11 },
				endpoint: null
			},
			{
				id: "/setup",
				pattern: /^\/setup\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 12 },
				endpoint: null
			},
			{
				id: "/team",
				pattern: /^\/team\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 13 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

export { manifest as m };
//# sourceMappingURL=manifest.js-D8OB_7ws.js.map
