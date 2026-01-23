import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { storage } from "@/lib/storage";
import { useRoute, Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Button } from "@/components/ui/button";
import { ChevronLeft, Filter, Download, ArrowUpRight, Clock, Users, MousePointerClick } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function QuizDashboard() {
  const [, params] = useRoute("/admin/quiz/:id/dashboard");
  const quizId = params?.id;
  
  if (!quizId) return <div>Invalid Quiz ID</div>;

  const quiz = storage.getQuizzes().find(q => q.id === quizId);
  const submissions = storage.getSubmissions().filter(s => s.quizId === quizId);
  
  if (!quiz) return <div>Quiz not found</div>;

  const starts = submissions.length;
  const completions = submissions.filter(s => s.status === 'completed').length;
  const completionRate = starts > 0 ? (completions / starts) * 100 : 0;
  const revenue = submissions.reduce((acc, sub) => acc + (sub.paid ? (quiz.price || 0) : 0), 0);
  const views = quiz.views || 0;
  const startRate = views > 0 ? (starts / views) * 100 : 0;

  // Mock Drop-off data
  const funnelData = [
    { name: 'Landing Page', count: views },
    { name: 'Start Quiz', count: starts },
    { name: 'Q1', count: Math.floor(starts * 0.9) },
    { name: 'Q2', count: Math.floor(starts * 0.8) },
    { name: 'Completion', count: completions },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <Link href="/admin">
               <Button variant="ghost" size="icon">
                 <ChevronLeft className="w-4 h-4" />
               </Button>
             </Link>
             <div className="space-y-1">
               <div className="flex items-center gap-2">
                 <h1 className="text-2xl font-bold tracking-tight">{quiz.title}</h1>
                 <Badge variant={quiz.published ? "default" : "secondary"}>{quiz.published ? "Live" : "Draft"}</Badge>
               </div>
               <p className="text-muted-foreground text-sm">Analytics Dashboard</p>
             </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" /> Last 30 Days
            </Button>
            <Link href={`/admin/quizzes/${quiz.id}`}>
              <Button>Edit Quiz</Button>
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{views}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                 <MousePointerClick className="w-3 h-3 mr-1" /> Landing Page Hits
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                 <Users className="w-3 h-3 mr-1" /> {completions} Completions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                 <ArrowUpRight className="w-3 h-3 mr-1" /> Avg ${((revenue/completions) || 0).toFixed(2)} / user
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2m 45s</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                 <Clock className="w-3 h-3 mr-1" /> per session
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Funnel Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Drop-off analysis per step.</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="h-[300px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: 'transparent'}} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={32} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </CardContent>
          </Card>
          
          <Card className="col-span-1">
             <CardHeader>
               <CardTitle>Recent Submissions</CardTitle>
               <CardDescription>Latest users who took this quiz.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="space-y-4">
                  {submissions.slice(0, 5).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{sub.email || 'Anonymous'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(sub.startedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                         <div className="font-bold text-sm">{sub.score} pts</div>
                         <div className="text-xs text-muted-foreground">{sub.status}</div>
                      </div>
                    </div>
                  ))}
                  {submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
