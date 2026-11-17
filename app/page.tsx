import { PostTaskForm } from "@/components/PostTaskForm";
import { GroveRoster } from "@/components/landing/GroveRoster";
import { HonestQuote } from "@/components/landing/HonestQuote";
import { LandingHero } from "@/components/landing/LandingHero";
import { LiveDemo } from "@/components/landing/LiveDemo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { WinnerDiagram } from "@/components/landing/WinnerDiagram";
import { Reveal } from "@/components/ui/Reveal";
import { SiteNav } from "@/components/ui/SiteNav";
import { getGroveRoster, type GroveAgent } from "@/lib/grove/roster";

export const revalidate = 600;

const STRIP_SIZE = 16;

/** Agents with delivered work first, then the most trusted, demos excluded. */
function pickStrip(roster: GroveAgent[]): GroveAgent[] {
  const eligible = roster.filter((agent) => !/public demo/i.test(agent.name));
  const proven = eligible
    .filter((agent) => agent.completed > 0)
    .sort((a, b) => b.completed - a.completed);
  const provenIds = new Set(proven.map((agent) => agent.id));
  const trusted = eligible
    .filter((agent) => !provenIds.has(agent.id))
    .sort((a, b) => b.reputation - a.reputation);
  return [...proven, ...trusted].slice(0, STRIP_SIZE);
}

export default async function HomePage() {
  const roster = await getGroveRoster();
  const heroAgents = roster.map(({ id, name, capabilities }) => ({ id, name, capabilities }));

  return (
    <>
      <SiteNav variant="overlay" />
      <main>
        <LandingHero agents={heroAgents} />
        <Reveal>
          <LiveDemo />
        </Reveal>
        <Reveal>
          <WinnerDiagram />
        </Reveal>
        <Reveal>
          <HonestQuote />
        </Reveal>
        <Reveal>
          <GroveRoster agents={pickStrip(roster)} total={roster.length} />
        </Reveal>

        <section id="post-task" aria-labelledby="post-title" className="scroll-mt-24 px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-16">
            <div className="md:sticky md:top-28 md:self-start">
              <h2 id="post-title" className="type-title max-w-[12ch] text-ink">
                Describe what you need
              </h2>
              <p className="type-lead mt-4 max-w-[40ch] text-ink-muted">
                Plain language is enough. You see the shortlist, the quotes and the judge&rsquo;s
                verdict as they happen.
              </p>
            </div>
            <PostTaskForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
