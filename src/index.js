// Sends www.cfbdynastyboard.com to the main domain, keeping the path. Everything else is the static site in ./public.
export default {
  fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url, 301);
    }
    return env.ASSETS.fetch(req);
  },
};
