export function normalizeAppHref(href: string): string {
  const path = href.split(/[?#]/)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routeToRegex(route: string): RegExp {
  const normalized = normalizeAppHref(route);
  const pattern = normalized
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) return "[^/]+";
      if (segment === "*") return ".*";
      return escapeRegex(segment);
    })
    .join("/");
  return new RegExp(`^${pattern}$`);
}

export function createAppRouteMatcher(
  routes: string[],
): (href: string) => boolean {
  const exactRoutes = new Set(routes.map(normalizeAppHref));
  const dynamicRoutes = routes
    .filter((route) => route.includes(":") || route.includes("*"))
    .map(routeToRegex);

  return (href: string) => {
    const normalized = normalizeAppHref(href);
    if (exactRoutes.has(normalized)) return true;
    return dynamicRoutes.some((route) => route.test(normalized));
  };
}
