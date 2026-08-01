import type { MetadataRoute } from "next";

/** Todo el contenido requiere sesión; los bots no tienen nada que indexar. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
