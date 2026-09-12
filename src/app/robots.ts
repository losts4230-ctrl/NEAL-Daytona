import type { MetadataRoute } from "next";

/**
 * The admin console and the API are kept out of search results. This is a
 * crawler courtesy, not a security control — both are protected server-side.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
  };
}
