import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useRoute, Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Download, ArrowUpRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function getAdminKey() {
  return typeof window !== "undefined" ? localStorage.getItem("adminKey") ?? "" : "";
}

type Submission = {
  id: string;
  packId: string;
  email: string | null;
  firstName: string | null;
  score: number | null;
  outcomeId: string | null;
  outcomeLabel: string | null;
  paid: boolean;
  completedAt: string | null;
  createdAt: string;
};

const PIE_COLORS = ["#16a34a", "#d97706", "#dc2626", "#6366f1", "#0ea5e9"];

function outcomeBadgeClass(label: string | null) {
  if (!label) return "secondary";
  const l = label.toLowerCase();
  if (l.includes("leader") || l.includes("preferred") || l.includes("high")) return "default";
  if (l.includes("caution") || l.includes("standard") || l.includes("moderate") || l.includes("aware")) return "secondary";
  return "destructive";
}

function exportCsv(submissions: Submission[], packSlug: string) {
  const headers = ["id", "email", "firstName", "score", "outcomeLabel", "paid", "completedAt", "createdAt"];
  const rows = submissions.map((s) => [
    s.id,
    s.email ?? "",
    s.firstName ?? "",
    s.score !== null ? String(s.score) : "",
    s.outcomeLabel ?? "",
    s.paid ? "true" : "false",
    s.completedAt ?? "",
    s.createdAt,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${packSlug}-leads.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function QuizDashboard() {
  const [, params] = useRoute("/admin/quiz/:id/dashboard");
  const packId = params?.id ?? "";

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ["pack-submissions", packId],
    queryFn: () => {
      const key = getAdminKey();
      return fetch(`/api/admin/packs/${packId}/submissions`, { headers: { "x-admin-key": key } }).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      });
    },
    enabled: Boolean(packId),
  });

  if (!packId) return <div className="p-8 text-muted-foreground">Invalid Quiz ID</div>;

  const total = submissions.length;
  const completed = submissions.filter((s) => s.completedAt !== null).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const revenue = submissions.filter((s) => s.paid).length * 49;

  const funnelData = [
    { name: "Total Starts", count: total },
    { name: "Completed", count: completed },
    { name: "Paid", count: submissions.filter((s) => s.paid).length },
  ];

  // Outcome breakdown for pie
  const outcomeMap = new Map<string, number>();
  submissions.forEach((s) => {
    if (s.outcomeLabel) outcomeMap.set(s.outcomeLabel, (outcomeMap.get(s.outcomeLabel) ?? 0) + 1);
  });
  const outcomeData = Array.from(outcomeMap.entries()).map(([name, value]) => ({ name, value }));

  // Infer pack name from first submission or fallback
  const packSlug = packId.slice(0, 12);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon"><ChevronLeft className="w-4 h-4" /></Button>
            </Link>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Quiz Analytics</h1>
              <p className="text-muted-foreground text-sm">{packId}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCsv(submissions, packSlug)}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center"><Users className="w-3 h-3 mr-1" /> All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completed}</div>
              <p className="text-xs text-muted-foreground mt-1">With email captured</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completionRate}%</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center"><ArrowUpRight className="w-3 h-3 mr-1" /> {completed} completions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">{submissions.filter((s) => s.paid).length} paid submissions</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Funnel Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Total → Completed → Paid</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={110} fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Outcome Pie */}
          <Card>
            <CardHeader>
              <CardTitle>Outcome Distribution</CardTitle>
              <CardDescription>How leads are being categorized</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                {outcomeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={outcomeData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" nameKey="name">
                        {outcomeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                {outcomeData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {item.name} ({item.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submissions Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>All Submissions</CardTitle>
              <CardDescription>Newest first — {total} total</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
              </div>
            ) : submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">First Name</th>
                      <th className="pb-3 pr-4 font-medium text-right">Score</th>
                      <th className="pb-3 pr-4 font-medium">Outcome</th>
                      <th className="pb-3 pr-4 font-medium text-center">Paid</th>
                      <th className="pb-3 font-medium text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{sub.email ?? <span className="text-muted-foreground">Anonymous</span>}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{sub.firstName ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-right">{sub.score ?? "—"}</td>
                        <td className="py-2.5 pr-4">
                          {sub.outcomeLabel ? (
                            <Badge variant={outcomeBadgeClass(sub.outcomeLabel) as "default" | "secondary" | "destructive" | "outline"} className="text-xs">{sub.outcomeLabel}</Badge>
                          ) : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-center">{sub.paid ? "✓" : "—"}</td>
                        <td className="py-2.5 text-right text-muted-foreground">{new Date(sub.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
