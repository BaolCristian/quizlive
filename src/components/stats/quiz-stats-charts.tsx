"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";

export interface SessionTrendPoint {
  label: string;
  avgScore: number;
}

export interface QuestionStatPoint {
  label: string;
  percentCorrect: number;
  avgTimeMs: number;
}

interface QuizStatsChartsProps {
  sessionTrend: SessionTrendPoint[];
  questionStats: QuestionStatPoint[];
}

function barColor(percent: number): string {
  if (percent < 30) return "#ef4444"; // red – problematic
  if (percent < 60) return "#f59e0b"; // amber – medium
  return "#22c55e"; // green – easy
}

export function QuizStatsCharts({
  sessionTrend,
  questionStats,
}: QuizStatsChartsProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Line chart – average score per session over time */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Punteggio medio per sessione
        </h3>
        {sessionTrend.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nessun dato disponibile.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={sessionTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, "auto"]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="#6366f1"
                strokeWidth={2}
                name="Punteggio medio"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Horizontal bar chart – % correct per question */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Percentuale risposte corrette per domanda
        </h3>
        {questionStats.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nessun dato disponibile.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, questionStats.length * 40)}>
            <BarChart
              data={questionStats}
              layout="vertical"
              margin={{ left: 20, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis
                type="category"
                dataKey="label"
                width={80}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(1)}%`, "Corrette"]}
              />
              <Bar dataKey="percentCorrect" name="Corrette" radius={[0, 4, 4, 0]}>
                {questionStats.map((entry, index) => (
                  <Cell key={index} fill={barColor(entry.percentCorrect)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
