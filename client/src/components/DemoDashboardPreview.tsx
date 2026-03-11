import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const DEMO_SUBMISSIONS_BY_DAY = [
  { date: "Feb 9", count: 4 },
  { date: "Feb 11", count: 7 },
  { date: "Feb 13", count: 5 },
  { date: "Feb 15", count: 12 },
  { date: "Feb 17", count: 9 },
  { date: "Feb 19", count: 14 },
  { date: "Feb 21", count: 11 },
  { date: "Feb 23", count: 18 },
  { date: "Feb 25", count: 15 },
  { date: "Feb 27", count: 22 },
  { date: "Mar 1", count: 19 },
  { date: "Mar 3", count: 26 },
  { date: "Mar 5", count: 24 },
  { date: "Mar 7", count: 31 },
  { date: "Mar 9", count: 28 },
  { date: "Mar 10", count: 33 },
];

const DEMO_OUTCOME_BREAKDOWN = [
  { name: "High Potential", value: 98, color: "#22c55e" },
  { name: "Needs Work", value: 142, color: "#f59e0b" },
  { name: "Not Ready", value: 72, color: "#ef4444" },
];

const DEMO_QUIZ_BREAKDOWN = [
  { name: "AI Readiness Check", submissions: 134, completionRate: 78 },
  { name: "Missed Calls Audit", submissions: 108, completionRate: 71 },
  { name: "Insurance Pre-Qual", submissions: 70, completionRate: 65 },
];

const KPI_CARDS = [
  { label: "Total Leads", value: "312", delta: "+24 this week" },
  { label: "Completed", value: "242", delta: "78% completion" },
  { label: "Avg Score", value: "64%", delta: "+3pts vs last month" },
  { label: "Revenue", value: "$0", delta: "Upgrade to unlock" },
];

export default function DemoDashboardPreview() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <div key={card.label} className="bg-card border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.delta}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Submissions trend */}
        <div className="md:col-span-2 bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Submissions (last 30 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={DEMO_SUBMISSIONS_BY_DAY} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={3} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                fill="url(#demoGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome breakdown */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Outcome Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={DEMO_OUTCOME_BREAKDOWN}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={75}
                dataKey="value"
              >
                {DEMO_OUTCOME_BREAKDOWN.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quiz breakdown table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-medium">Quiz Performance</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Quiz</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Leads</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Completion</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_QUIZ_BREAKDOWN.map((row) => (
              <tr key={row.name} className="border-b last:border-0">
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2 text-right">{row.submissions}</td>
                <td className="px-4 py-2 text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      row.completionRate >= 70
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {row.completionRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
