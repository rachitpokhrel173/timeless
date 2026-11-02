/**
 * Request header the proxy sets to the requested path (overwriting anything the browser sent), so
 * server layouts can send field-team logins to the matching staff-portal page. Informational only:
 * never use it for access decisions.
 */
export const PATH_HEADER = "x-tt-path";
