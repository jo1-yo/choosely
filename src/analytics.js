// Thin PostHog wrapper.
//
// - No-op unless VITE_POSTHOG_KEY is set at build time (so local dev and forks send nothing).
// - posthog-js is loaded lazily, after the first paint, so it never delays the app.
// - Privacy: autocapture is OFF and we only send hand-written events that carry counts and
//   step names — never option names, descriptions or any other text the user typed.
//   Session replay masks all inputs plus anything tagged with the `ph-mask` class.
// - Visit /choosely/?notrack once in a browser to exclude yourself; /choosely/?track undoes it.

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const OPT_OUT_KEY = "choosely:notrack";

let enabled = false;
let client = null;
let context = {};
const pending = [];

function isOptedOut() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("notrack")) localStorage.setItem(OPT_OUT_KEY, "1");
    if (q.has("track")) localStorage.removeItem(OPT_OUT_KEY);
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function load() {
  import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        capture_exceptions: true,
        person_profiles: "identified_only",
        respect_dnt: true,
        disable_surveys: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: ".ph-mask",
        },
      });
      client = posthog;
      client.register(context);
      pending.splice(0).forEach(([event, props]) => client.capture(event, props));
    })
    .catch(() => {
      // Blocked by an ad blocker / offline: analytics is best-effort, never break the app.
      enabled = false;
      pending.length = 0;
    });
}

export function initAnalytics() {
  if (!KEY || isOptedOut()) return;
  enabled = true;
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 1500);
}

// Properties attached to every later event (and to $pageleave), e.g. the current step.
export function setContext(props) {
  context = { ...context, ...props };
  if (client) client.register(props);
}

export function track(event, props = {}) {
  if (import.meta.env.DEV) console.debug("[analytics]", event, props);
  if (!enabled) return;
  if (client) client.capture(event, props);
  else pending.push([event, props]);
}
