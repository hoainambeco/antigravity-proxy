import axios from 'axios';

/**
 * Never follow redirects on any outbound HTTP request made by this process.
 *
 * Upstream targets are fixed provider hosts; a redirect is never a legitimate
 * answer, and following one is how a compromised/misbehaving upstream could point
 * the proxy at an internal address (metadata endpoints, loopback, LAN). Axios
 * instances built via `axios.create()` inherit the global defaults at creation
 * time, so this module must be imported before any module that creates one.
 */
axios.defaults.maxRedirects = 0;
