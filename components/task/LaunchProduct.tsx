import { Pill } from "@/components/ui/Pill";
import type { CampaignLaunchArtifact } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

const INSET = "rounded-control bg-surface-muted p-3";

export function LaunchProduct({ artifact }: { artifact: CampaignLaunchArtifact }) {
  const topCreators = artifact.creators.slice(0, 5);
  return (
    <div className="space-y-6">
      <div className="rounded-control bg-brand-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="type-subheading text-ink">{artifact.title}</h3>
          <Pill tone="success">Ready to launch</Pill>
        </div>
        <p className="mt-2 max-w-[70ch] text-sm text-ink-soft">{artifact.summary}</p>
      </div>

      <section>
        <SectionTitle title="Creator shortlist" meta="Ranked by live Reacher GMV" />
        <div className="grid gap-2 md:grid-cols-2">
          {topCreators.map((creator) => (
            <div key={creator.handle} className={INSET}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="type-data text-sm text-ink">
                    #{creator.rank} {creator.handle}
                  </div>
                  <p className="mt-1 text-[0.8125rem] text-ink-muted">
                    {creator.fit_reason}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="type-data text-sm text-ink">
                    {formatMoney(creator.gmv)}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {creator.followers.toLocaleString("en-US")} followers
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Units" value={creator.units_sold} />
                <Metric label="Orders" value={creator.orders} />
                <Metric
                  label="Commission"
                  value={formatMoney(creator.estimated_commission)}
                />
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Outreach drafts" meta="Creator-specific copy" />
        <div className="grid gap-2 md:grid-cols-3">
          {artifact.outreach_drafts.map((draft) => (
            <div key={draft.handle} className={INSET}>
              <div className="type-data mb-2 text-xs text-brand-700">
                {draft.handle}
              </div>
              <p className="line-clamp-6 text-[0.8125rem] leading-5 text-ink">
                {draft.message}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle title="Sample request tasks" meta="Operator checklist" />
          <div className="space-y-2">
            {artifact.sample_plan.map((item) => (
              <div
                key={item.task}
                className={`${INSET} flex items-center justify-between gap-3 text-[0.8125rem]`}
              >
                <div>
                  <div className="text-ink">{item.task}</div>
                  <div className="mt-0.5 text-ink-muted">{item.owner}</div>
                </div>
                <Pill>{item.status}</Pill>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title="Risk controls" meta="Before samples ship" />
          <div className="space-y-2">
            {artifact.risk_flags.map((risk) => (
              <div
                key={risk}
                className="rounded-control bg-danger-50 px-3 py-2 text-[0.8125rem] text-danger-700"
              >
                {risk}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <SectionTitle title="7-day launch board" meta="What happens next" />
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          {artifact.launch_plan.map((day) => (
            <div key={day.day} className={INSET}>
              <div className="type-data text-xs text-brand-700">Day {day.day}</div>
              <p className="mt-2 text-[0.8125rem] leading-5 text-ink">{day.action}</p>
              <div className="mt-3 text-[0.8125rem] text-ink-muted">{day.metric}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Evidence" meta="Live MCP tool calls" />
        <div className={`${INSET} text-[0.8125rem] text-ink-muted`}>
          <div className="flex flex-wrap gap-2">
            {artifact.evidence.tools_used.map((tool) => (
              <span
                key={tool}
                className="type-data rounded-full bg-surface px-2.5 py-1 text-xs text-ink"
              >
                {tool}
              </span>
            ))}
          </div>
          <dl className="mt-3 space-y-1">
            <div className="flex gap-1.5">
              <dt>Window</dt>
              <dd className="type-data text-ink">
                {artifact.evidence.performance_window}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Shops</dt>
              <dd>{artifact.evidence.shops_queried.join(", ") || "all accessible shops"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
      <h4 className="text-[0.9375rem] font-semibold text-ink">{title}</h4>
      <span className="text-[0.8125rem] text-ink-muted">{meta}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="type-data text-[0.8125rem] text-ink">{value}</dd>
    </div>
  );
}
