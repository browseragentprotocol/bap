/**
 * @fileoverview Stealth evasion scripts for bot detection bypass
 * @module @browseragentprotocol/server-playwright/stealth/evasions
 *
 * Three-tier stealth architecture:
 *   Tier 1: JavaScript evasions via addInitScript() — ~70% coverage
 *   Tier 2: rebrowser-patches for Runtime.Enable fix — ~85% (external)
 *   Tier 3: Passive CDP on user's Chrome (--connect --stealth) — ~99%
 *
 * This file implements Tier 1 evasions, adapted from puppeteer-extra-plugin-stealth.
 * Each evasion is a self-contained init script that runs before any page JavaScript.
 */

/**
 * Launch args that reduce automation fingerprint.
 * Applied via chromium.launch({ args: [...] }).
 */
export function getStealthLaunchArgs(): string[] {
  return [
    "--disable-blink-features=AutomationControlled", // Removes navigator.webdriver
    "--disable-features=AutomationControlled",
    "--disable-infobars", // Removes "Chrome is being controlled" bar
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-component-update",
  ];
}

/**
 * Init scripts that patch detectable browser properties.
 * Each script is self-contained and runs in the page context
 * via context.addInitScript() before any page JavaScript executes.
 */
export function getStealthScripts(): string[] {
  return [
    // 1. navigator.webdriver — the #1 detection signal
    `Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });`,

    // 2. window.chrome — headless Chrome lacks this object
    `if (!window.chrome) {
      window.chrome = {
        app: {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        },
        runtime: {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
          connect: function() { throw new Error("Could not establish connection. Receiving end does not exist."); },
          sendMessage: function() { throw new Error("Could not establish connection. Receiving end does not exist."); },
          id: undefined,
        },
        csi: function() { return {}; },
        loadTimes: function() { return {}; },
      };
    }`,

    // 3. navigator.plugins — headless returns empty PluginArray
    `Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const makePlugin = (name, filename, desc) => {
          const p = { name, filename, description: desc, length: 1 };
          p[0] = { type: 'application/pdf', suffixes: 'pdf', description: desc, enabledPlugin: p };
          p.__proto__ = Plugin.prototype;
          return p;
        };
        const plugins = [
          makePlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format'),
          makePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
          makePlugin('Native Client', 'internal-nacl-plugin', ''),
        ];
        plugins.__proto__ = PluginArray.prototype;
        Object.defineProperty(plugins, 'length', { value: 3 });
        return plugins;
      },
      configurable: true,
    });`,

    // 4. navigator.languages — headless may return undefined
    `Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true,
    });`,

    // 5. navigator.permissions — fix notification permission inconsistency
    `const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) => {
      if (params.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return origQuery(params);
    };`,

    // 6. WebGL vendor/renderer — headless returns SwiftShader
    `const getParamProxy = new Proxy(WebGLRenderingContext.prototype.getParameter, {
      apply: function(target, thisArg, args) {
        if (args[0] === 37445) return 'Intel Inc.';
        if (args[0] === 37446) return 'Intel Iris OpenGL Engine';
        return Reflect.apply(target, thisArg, args);
      },
    });
    WebGLRenderingContext.prototype.getParameter = getParamProxy;
    if (typeof WebGL2RenderingContext !== 'undefined') {
      WebGL2RenderingContext.prototype.getParameter = getParamProxy;
    }`,

    // 7. window.outerWidth/outerHeight — zero in headless
    `if (window.outerWidth === 0) {
      Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
    }
    if (window.outerHeight === 0) {
      Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 });
    }`,

    // 8. iframe.contentWindow — cross-origin detection bypass
    `const origCreateElement = document.createElement.bind(document);
    document.createElement = new Proxy(origCreateElement, {
      apply: (target, thisArg, args) => {
        const el = Reflect.apply(target, thisArg, args);
        if (args[0]?.toLowerCase() === 'iframe') {
          Object.defineProperty(el, 'contentWindow', {
            get: new Proxy(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get, {
              apply(target, thisArg) {
                const win = Reflect.apply(target, thisArg, []);
                if (win) {
                  try {
                    Object.defineProperty(win, 'chrome', { get: () => window.chrome, configurable: true });
                  } catch {}
                }
                return win;
              },
            }),
            configurable: true,
          });
        }
        return el;
      },
    });`,

    // 9. Media codecs — ensure proper codec support reporting
    `const origCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) {
      if (type === 'video/mp4; codecs="avc1.42E01E"') return 'probably';
      if (type === 'video/webm; codecs="vp8, vorbis"') return 'probably';
      if (type === 'audio/mpeg') return 'probably';
      return origCanPlayType.call(this, type);
    };`,

    // 10. Broken image dimensions — headless returns 0x0, real Chrome returns 16x16
    `Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      get: function() {
        if (this.complete && this.naturalWidth === 0) return 16;
        return Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth')?.get?.call(this) ?? 0;
      },
    });`,

    // 11. Web Worker consistency — ensure navigator patches propagate
    // This creates a patched Worker that inherits the main thread's navigator values
    `const OrigWorker = window.Worker;
    window.Worker = new Proxy(OrigWorker, {
      construct(target, args) {
        return Reflect.construct(target, args);
      },
    });`,

    // 12. console.debug timing — remove automation framework debug listeners
    `const origDebug = console.debug;
    console.debug = function(...args) {
      return origDebug.apply(this, args);
    };`,
  ];
}

/**
 * CDP methods to AVOID in Passive CDP mode (Tier 3).
 * These methods leave detectable traces that anti-bot services check for.
 * When --connect --stealth is used, BAP should use alternatives.
 */
export const PASSIVE_CDP_BLOCKLIST = new Set([
  "Runtime.enable", // Creates detectable execution contexts
  "Runtime.evaluate", // Leaves sourceURL markers
  "Page.addScriptToEvaluateOnNewDocument", // Detectable init script injection
  "Page.createIsolatedWorld", // Creates __playwright_utility_world__
]);

/**
 * Safe CDP methods for Passive CDP mode.
 * These methods are used by Chrome DevTools itself and do not
 * create detectable traces.
 */
export const PASSIVE_CDP_ALLOWLIST = new Set([
  "DOM.getDocument",
  "DOM.querySelectorAll",
  "DOM.getBoxModel",
  "DOM.getOuterHTML",
  "DOM.describeNode",
  "Page.captureScreenshot",
  "Page.navigate",
  "Input.dispatchMouseEvent",
  "Input.dispatchKeyEvent",
  "Input.dispatchTouchEvent",
  "Accessibility.getFullAXTree",
  "Network.getCookies",
  "Network.setCookie",
  "Emulation.setDeviceMetricsOverride",
  "Emulation.setUserAgentOverride",
  "Target.getTargets",
  "Target.attachToTarget",
  "Performance.getMetrics",
]);
