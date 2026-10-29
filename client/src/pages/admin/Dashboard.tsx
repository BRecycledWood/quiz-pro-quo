import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { CheckCircle, Eye, Mail, Users, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CUSTOM_DEMO_MAILTO = "mailto:hello@howstud.io?subject=Custom%20Demo%20Request&body=Hi%2C%20I%27d%20like%20to%20request%20a%20custom%20demo.%0A%0ACompany%3A%20%0AUse%20case%3A%20%0AIndustry%3A%20";

function getAdminKey() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("adminKey") ?? (import.meta.env.DEV ? "local-dev-admin-key" : "");
}

function adminFetch(url: string) {
  const key = getAdminKey();
  return fetch(url, { headers: { "x-admin-key": key } }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
}

type WorkspaceStats = {
  totalViews: number;
  totalSubmissions: number;
  completedSubmissions: number;
  totalLeads: number;
  totalRevenue: number;
  avgCompletionRate: number;
  conversionRate: number;
  averageScore: number | null;
  submissionsByDay: Array<{ date: string; count: number }>;
  outcomeBreakdown: Array<{ outcomeId: string; label: string; count: number }>;
  quizBreakdown: Array<{
    packId: string;
    packName: string;
    packSlug: string;
    totalViews: number;
    totalSubmissions: number;
    completedSubmissions: number;
    totalLeads: number;
    completionRate: number;
    conversionRate: number;
    averageScore: number | null;
    totalRevenue: number;
    lastSubmissionAt: string | null;
  }>;
};

type Submission = {
  id: string;
  email: string | null;
  firstName: string | null;
  packId: string;
  outcomeLabel: string | null;
  completedAt: string | null;
  createdAt: string;
  paid: boolean;
};

type Workspace = { id: string; name: string; slug: string };

const PIE_COLORS = ["#16a34a", "#d97706", "#dc2626", "#6366f1", "#0ea5e9"];

function completionBadge(rate: number) {
  if (rate >= 60) return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{rate}%</Badge>;
  if (rate >= 30) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{rate}%</Badge>;
  return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{rate}%</Badge>;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");

  const { data: workspacesData, isLoading: workspacesLoading, isError: workspacesError } = useQuery<{ workspaces: Workspace[] }>({
    queryKey: ["/api/admin/workspaces"],
    queryFn: () => adminFetch("/api/admin/workspaces"),
  });
  const defaultWorkspaceId = workspacesData?.workspaces?.[0]?.id ?? "";
  useEffect(() => {
    if (!selectedWorkspaceId && defaultWorkspaceId) setSelectedWorkspaceId(defaultWorkspaceId);
  }, [selectedWorkspaceId, defaultWorkspaceId]);
  const workspaceId = selectedWorkspaceId || defaultWorkspaceId;

  const { data: stats, isLoading: statsLoading } = useQuery<WorkspaceStats>({
    queryKey: ["stats", workspaceId],
    queryFn: () => adminFetch(`/api/admin/workspaces/${workspaceId}/stats`),
    enabled: Boolean(workspaceId),
  });

  const { data: subsData } = useQuery<{ submissions: Submission[]; total: number }>({
    queryKey: ["submissions", workspaceId],
    queryFn: () => adminFetch(`/api/admin/workspaces/${workspaceId}/submissions?limit=10`),
    enabled: Boolean(workspaceId),
  });

  // Build pack name map from stats
  const packNameMap: Record<string, string> = {};
  stats?.quizBreakdown?.forEach((q) => { packNameMap[q.packId] = q.packName; });

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Assessment Analytics</h1>
          <p className="text-muted-foreground">Views, completion, lead conversion, and outcomes across your workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workspacesData?.workspaces && workspacesData.workspaces.length > 1 ? (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Select workspace"
              value={workspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            >
              {workspacesData.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          ) : null}
          <Link href="/admin"><Button variant="outline">Manage packs</Button></Link>
          {workspacesLoading ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
        </div>
      </div>
      {workspacesError ? (
        <Card className="mb-8 border-destructive/50">
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>Enter your admin key in Pack Admin, then return here to view analytics.</CardDescription>
          </CardHeader>
          <CardContent><Link href="/admin"><Button>Open Pack Admin</Button></Link></CardContent>
        </Card>
      ) : null}

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-8">
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assessment views</CardTitle>
            <Eye className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? stats.totalViews.toLocaleString() : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">Public pack page visits</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads captured</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? stats.totalLeads.toLocaleString() : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed assessments with email</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? `${stats.avgCompletionRate}%` : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">Started sessions that finished</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">View-to-lead conversion</CardTitle>
            <Mail className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? `${stats.conversionRate}%` : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">Captured leads per public view</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average score</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.averageScore !== null && stats?.averageScore !== undefined ? stats.averageScore.toFixed(1) : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">Across completed assessments</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mb-8">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Assessment completions over time</CardTitle>
            <CardDescription>Completed assessments — last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              {stats?.submissionsByDay ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.submissionsByDay}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="date" stroke="#888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                    <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>Outcome Breakdown</CardTitle>
            <CardDescription>Distribution across all quizzes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center relative">
              {stats?.outcomeBreakdown && stats.outcomeBreakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.outcomeBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="count" nameKey="label">
                        {stats.outcomeBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                    <span className="text-3xl font-bold">{stats.completedSubmissions}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Total</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
            {stats?.outcomeBreakdown && stats.outcomeBreakdown.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs text-muted-foreground">
                {stats.outcomeBreakdown.map((item, i) => (
                  <div key={item.outcomeId} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {item.label} ({item.count})
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Quiz Performance Table */}
      <Card className="mb-8 shadow-sm">
        <CardHeader>
          <CardTitle>Quiz Performance</CardTitle>
          <CardDescription>Click a row to view detailed analytics.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.quizBreakdown && stats.quizBreakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-3 pr-4 font-medium">Assessment</th>
                    <th className="pb-3 pr-4 font-medium text-right">Views</th>
                    <th className="pb-3 pr-4 font-medium text-right">Leads</th>
                    <th className="pb-3 pr-4 font-medium text-right">Completion</th>
                    <th className="pb-3 pr-4 font-medium text-right">Conversion</th>
                    <th className="pb-3 font-medium text-right">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.quizBreakdown.map((quiz) => (
                    <tr
                      key={quiz.packId}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/admin/quiz/${quiz.packId}/dashboard`)}
                    >
                      <td className="py-3 pr-4 font-medium">{quiz.packName}</td>
                      <td className="py-3 pr-4 text-right">{quiz.totalViews.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">{quiz.totalLeads.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">{completionBadge(quiz.completionRate)}</td>
                      <td className="py-3 pr-4 text-right">{completionBadge(quiz.conversionRate)}</td>
                      <td className="py-3 text-right text-muted-foreground">
                        {quiz.lastSubmissionAt ? new Date(quiz.lastSubmissionAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No quizzes yet. Create your first quiz in the Pack Admin.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Submissions Feed */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
          <CardDescription>Latest submissions across all quizzes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {subsData?.submissions && subsData.submissions.some((sub) => sub.completedAt && sub.email) ? (
              subsData.submissions.filter((sub) => sub.completedAt && sub.email).map((sub) => (
                <div key={sub.id} className="flex items-center pb-3 border-b last:border-0 last:pb-0">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                    {(sub.email ?? "A").charAt(0).toUpperCase()}
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sub.email ?? "Anonymous"}</p>
                    <p className="text-xs text-muted-foreground">
                      {packNameMap[sub.packId] ?? sub.packId} · {new Date(sub.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2 shrink-0">
                    {sub.outcomeLabel ? (
                      <Badge variant="outline" className="text-xs">{sub.outcomeLabel}</Badge>
                    ) : null}
                    {sub.paid ? <Badge className="bg-green-600 text-xs">Paid</Badge> : null}
                  </div>
                </div>
              ))
            ) : statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">No submissions yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
