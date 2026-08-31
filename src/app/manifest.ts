import type { MetadataRoute } from "next";

/**
 * §44 — PWA-readiness for the scorer: standalone display so a scorer who
 * adds the app to their home screen gets a full-screen, app-like session
 * rather than a browser chrome around every match.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Badminton Scoring",
    short_name: "Badminton",
    description: "Live badminton scoring and tournament management.",
    start_url: "/scorer",
    display: "standalone",
    background_color: "#f8fafa",
    theme_color: "#1c7a4c",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
