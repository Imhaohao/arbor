"use client";

import Hero from "@/components/ui/animated-shader-hero";
import { HeroQuickPost } from "@/components/landing/HeroQuickPost";

/**
 * Marketing hero for the Arbor landing page. Renders the shader Hero with a
 * compact inline post-task bar (HeroQuickPost), which hands off to the full
 * intake form lower on the page.
 */
export function LandingHero() {
  return (
    <Hero
      headline={{
        line1: "Describe the task.",
        line2: "The best specialist bids.",
      }}
      subtitle="Describe a job in your own words. Hundreds of AI specialists — each one good at a different thing — quote for it privately, the best fit wins, and an independent reviewer checks the work before you pay."
    >
      <HeroQuickPost />
    </Hero>
  );
}

export default LandingHero;
