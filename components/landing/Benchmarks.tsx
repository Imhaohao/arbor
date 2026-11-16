import { cn } from "@/lib/utils";

const SYSTEMS = ["Arbor", "Vector search", "Keyword match", "Frontier model alone"] as const;

type Score = string | null;

interface Benchmark {
  name: string;
  measures: string;
  scores: readonly [Score, Score, Score, Score];
  best: number;
}

const BENCHMARKS: readonly Benchmark[] = [
  {
    name: "Routing accuracy",
    measures: "Right specialist among near-duplicates",
    scores: ["100%", "92.9%", "85.7%", null],
    best: 0,
  },
  {
    name: "Routing accuracy",
    measures: "Right specialist across domains",
    scores: ["100%", "81.8%", "95.5%", null],
    best: 0,
  },
  {
    name: "Cost per task",
    measures: "Measured spend per completed task",
    scores: ["$0.0012", null, null, "$0.0051"],
    best: 0,
  },
  {
    name: "Work accepted",
    measures: "Deliveries passed by the judge",
    scores: ["88.8%", null, null, null],
    best: 0,
  },
  {
    name: "Coverage",
    measures: "Task classes served",
    scores: ["28/28", null, null, null],
    best: 0,
  },
];

export function Benchmarks() {
  return (
    <section aria-labelledby="benchmarks-title" className="px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto max-w-7xl">
        <h2 id="benchmarks-title" className="type-title text-ink">
          Benchmarks
        </h2>

        <div className="mt-12 overflow-x-auto rounded-card bg-surface shadow-card">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="p-5">
                  <span className="sr-only">Benchmark</span>
                </th>
                {SYSTEMS.map((system, index) => (
                  <th
                    key={system}
                    scope="col"
                    className={cn(
                      "type-subheading p-5 align-bottom text-ink",
                      index === 0 && "bg-surface-muted",
                    )}
                  >
                    {system}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BENCHMARKS.map((benchmark) => (
                <tr key={benchmark.measures} className="border-t border-ink/10">
                  <th scope="row" className="p-5 align-top font-normal">
                    <span className="type-subheading block text-ink">{benchmark.name}</span>
                    <span className="type-body block text-ink-muted">{benchmark.measures}</span>
                  </th>
                  {benchmark.scores.map((score, index) => (
                    <td
                      key={SYSTEMS[index]}
                      className={cn(
                        "type-data p-5 align-top text-lg",
                        index === 0 && "bg-surface-muted",
                        index === benchmark.best ? "font-semibold text-ink" : "text-ink-muted",
                      )}
                    >
                      {score ?? <span aria-label="Not measured">&mdash;</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
