// The paper's sections, in masthead order. Every function belongs to one of them.

export const SECTIONS = [
  { id: "home", label: "Home", href: "/" },
  { id: "markets", label: "Markets", href: "/markets" },
  { id: "portfolio", label: "Portfolio", href: "/portfolio" },
  { id: "goal", label: "Goal", href: "/goal" },
  { id: "news", label: "News", href: "/news" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/** Which section a URL belongs to, for the masthead's active link. */
export function sectionFor(pathname: string): SectionId | null {
  if (pathname === "/") return "home";
  const match = SECTIONS.find((s) => s.href !== "/" && (pathname === s.href || pathname.startsWith(`${s.href}/`)));
  return match?.id ?? null;
}
