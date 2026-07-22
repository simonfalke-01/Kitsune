
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const COREPACK_ROOT: string;
	export const TEXTRA_INSTALL: string;
	export const ZELLIJ: string;
	export const TERM_PROGRAM: string;
	export const FNM_LOGLEVEL: string;
	export const NODE: string;
	export const _P9K_TTY: string;
	export const INIT_CWD: string;
	export const SHELL: string;
	export const TERM: string;
	export const FNM_NODE_DIST_MIRROR: string;
	export const HOMEBREW_REPOSITORY: string;
	export const TMPDIR: string;
	export const CODEX_MANAGED_PACKAGE_ROOT: string;
	export const CONDA_SHLVL: string;
	export const LIBRARY_PATH: string;
	export const TERM_PROGRAM_VERSION: string;
	export const FPATH: string;
	export const NO_COLOR: string;
	export const TERM_SESSION_ID: string;
	export const npm_config_registry: string;
	export const LC_ALL: string;
	export const BROWSER_USE_AVAILABLE_BACKENDS: string;
	export const FNM_COREPACK_ENABLED: string;
	export const USER: string;
	export const _CONDA_EXE: string;
	export const COMMAND_MODE: string;
	export const CONDA_EXE: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const CPATH: string;
	export const SSH_AUTH_SOCK: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const TERM_FEATURES: string;
	export const npm_config_dir: string;
	export const npm_execpath: string;
	export const PAGER: string;
	export const FNM_VERSION_FILE_STRATEGY: string;
	export const _CE_CONDA: string;
	export const npm_config_frozen_lockfile: string;
	export const npm_config_verify_deps_before_run: string;
	export const FNM_ARCH: string;
	export const PATH: string;
	export const TERMINFO_DIRS: string;
	export const npm_package_json: string;
	export const CODEX_THREAD_ID: string;
	export const __CFBundleIdentifier: string;
	export const COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
	export const PWD: string;
	export const npm_command: string;
	export const P9K_SSH: string;
	export const npm_config__jsr_registry: string;
	export const npm_lifecycle_event: string;
	export const LANG: string;
	export const P9K_TTY: string;
	export const npm_package_name: string;
	export const ITERM_PROFILE: string;
	export const NODE_PATH: string;
	export const CODEX_MANAGED_BY_NPM: string;
	export const FNM_MULTISHELL_PATH: string;
	export const XPC_FLAGS: string;
	export const CODEX_CI: string;
	export const DOCKER_DEFAULT_PLATFORM: string;
	export const ZELLIJ_PANE_ID: string;
	export const npm_config_node_gyp: string;
	export const CXX: string;
	export const XPC_SERVICE_NAME: string;
	export const _CE_M: string;
	export const _CONDA_ROOT: string;
	export const npm_package_version: string;
	export const pnpm_config_verify_deps_before_run: string;
	export const COLORFGBG: string;
	export const HOME: string;
	export const SHLVL: string;
	export const LC_TERMINAL_VERSION: string;
	export const THEOS: string;
	export const HOMEBREW_PREFIX: string;
	export const FNM_DIR: string;
	export const GH_PAGER: string;
	export const ITERM_SESSION_ID: string;
	export const CONDA_PYTHON_EXE: string;
	export const LOGNAME: string;
	export const npm_lifecycle_script: string;
	export const LC_CTYPE: string;
	export const BUN_INSTALL: string;
	export const PKG_CONFIG_PATH: string;
	export const FNM_RESOLVE_ENGINES: string;
	export const NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S: string;
	export const npm_config_user_agent: string;
	export const HOMEBREW_CELLAR: string;
	export const INFOPATH: string;
	export const CC: string;
	export const CMAKE_PREFIX_PATH: string;
	export const LC_TERMINAL: string;
	export const _P9K_SSH_TTY: string;
	export const OSLogRateLimit: string;
	export const GIT_PAGER: string;
	export const NODE_REPL_TRUSTED_CODE_PATHS: string;
	export const COLORTERM: string;
	export const ZELLIJ_SESSION_NAME: string;
	export const npm_config_prefix: string;
	export const npm_node_execpath: string;
	export const TEST: string;
	export const VITEST: string;
	export const NODE_ENV: string;
	export const PROD: string;
	export const DEV: string;
	export const BASE_URL: string;
	export const MODE: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		COREPACK_ROOT: string;
		TEXTRA_INSTALL: string;
		ZELLIJ: string;
		TERM_PROGRAM: string;
		FNM_LOGLEVEL: string;
		NODE: string;
		_P9K_TTY: string;
		INIT_CWD: string;
		SHELL: string;
		TERM: string;
		FNM_NODE_DIST_MIRROR: string;
		HOMEBREW_REPOSITORY: string;
		TMPDIR: string;
		CODEX_MANAGED_PACKAGE_ROOT: string;
		CONDA_SHLVL: string;
		LIBRARY_PATH: string;
		TERM_PROGRAM_VERSION: string;
		FPATH: string;
		NO_COLOR: string;
		TERM_SESSION_ID: string;
		npm_config_registry: string;
		LC_ALL: string;
		BROWSER_USE_AVAILABLE_BACKENDS: string;
		FNM_COREPACK_ENABLED: string;
		USER: string;
		_CONDA_EXE: string;
		COMMAND_MODE: string;
		CONDA_EXE: string;
		PNPM_SCRIPT_SRC_DIR: string;
		CPATH: string;
		SSH_AUTH_SOCK: string;
		__CF_USER_TEXT_ENCODING: string;
		TERM_FEATURES: string;
		npm_config_dir: string;
		npm_execpath: string;
		PAGER: string;
		FNM_VERSION_FILE_STRATEGY: string;
		_CE_CONDA: string;
		npm_config_frozen_lockfile: string;
		npm_config_verify_deps_before_run: string;
		FNM_ARCH: string;
		PATH: string;
		TERMINFO_DIRS: string;
		npm_package_json: string;
		CODEX_THREAD_ID: string;
		__CFBundleIdentifier: string;
		COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
		PWD: string;
		npm_command: string;
		P9K_SSH: string;
		npm_config__jsr_registry: string;
		npm_lifecycle_event: string;
		LANG: string;
		P9K_TTY: string;
		npm_package_name: string;
		ITERM_PROFILE: string;
		NODE_PATH: string;
		CODEX_MANAGED_BY_NPM: string;
		FNM_MULTISHELL_PATH: string;
		XPC_FLAGS: string;
		CODEX_CI: string;
		DOCKER_DEFAULT_PLATFORM: string;
		ZELLIJ_PANE_ID: string;
		npm_config_node_gyp: string;
		CXX: string;
		XPC_SERVICE_NAME: string;
		_CE_M: string;
		_CONDA_ROOT: string;
		npm_package_version: string;
		pnpm_config_verify_deps_before_run: string;
		COLORFGBG: string;
		HOME: string;
		SHLVL: string;
		LC_TERMINAL_VERSION: string;
		THEOS: string;
		HOMEBREW_PREFIX: string;
		FNM_DIR: string;
		GH_PAGER: string;
		ITERM_SESSION_ID: string;
		CONDA_PYTHON_EXE: string;
		LOGNAME: string;
		npm_lifecycle_script: string;
		LC_CTYPE: string;
		BUN_INSTALL: string;
		PKG_CONFIG_PATH: string;
		FNM_RESOLVE_ENGINES: string;
		NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S: string;
		npm_config_user_agent: string;
		HOMEBREW_CELLAR: string;
		INFOPATH: string;
		CC: string;
		CMAKE_PREFIX_PATH: string;
		LC_TERMINAL: string;
		_P9K_SSH_TTY: string;
		OSLogRateLimit: string;
		GIT_PAGER: string;
		NODE_REPL_TRUSTED_CODE_PATHS: string;
		COLORTERM: string;
		ZELLIJ_SESSION_NAME: string;
		npm_config_prefix: string;
		npm_node_execpath: string;
		TEST: string;
		VITEST: string;
		NODE_ENV: string;
		PROD: string;
		DEV: string;
		BASE_URL: string;
		MODE: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
