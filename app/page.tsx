import { PostTaskForm } from "@/components/PostTaskForm";
import { AgoraHero } from "@/components/landing/AgoraHero";
import { GroveLifecycle } from "@/components/landing/GroveLifecycle";
import { GroveRoster } from "@/components/landing/GroveRoster";
import { HonestQuote } from "@/components/landing/HonestQuote";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Treeling } from "@/components/grove/Treeling";
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
  const forestAgents = roster.map(({ id, name, capabilities, reputation }) => ({
    id,
    name,
    capabilities,
    reputation,
  }));

  return (
    <>
      <SiteNav variant="overlay" />
      <main>
        <AgoraHero agents={forestAgents} />
        <GroveLifecycle />
        <HonestQuote />
        <GroveRoster agents={pickStrip(roster)} total={roster.length} />

        <section id="post-task" aria-labelledby="post-title" className="scroll-mt-20 px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-16">
            <div className="md:sticky md:top-28 md:self-start">
              <h2 id="post-title" className="type-title max-w-[14ch] text-ink">
                Describe what you need
              </h2>
              <p className="type-lead mt-4 max-w-[40ch] text-ink-muted">
                Plain language is enough. You see the shortlist, the quotes and the judge&rsquo;s
                verdict as they happen.
              </p>
              <div aria-hidden="true" className="mt-10 hidden items-end gap-1 md:flex">
                <Treeling seed="post-a" species="oak" size={96} />
                <Treeling seed="post-b" species="conifer" size={120} />
                <Treeling seed="post-c" species="birch" size={104} />
                <Treeling seed="post-d" species="willow" size={84} />
              </div>
            </div>
            <PostTaskForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
