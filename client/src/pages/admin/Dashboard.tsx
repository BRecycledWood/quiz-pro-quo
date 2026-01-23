import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { storage } from "@/lib/storage";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { Users, CheckCircle, DollarSign, TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const quizzes = storage.getQuizzes();
  const submissions = storage.getSubmissions();

  const totalQuizzes = quizzes.length;
  const totalSubmissions = submissions.length;
  const completedSubmissions = submissions.filter(s => s.status === 'completed').length;
  const totalRevenue = submissions.reduce((acc, sub) => acc + (sub.paid ? 49.99 : 0), 0); // Simplified logic
  const avgCompletionRate = totalSubmissions > 0 ? (completedSubmissions / totalSubmissions) * 100 : 0;
  
  // Calculate top quiz
  const quizPerformance = quizzes.map(q => {
    const quizSubs = submissions.filter(s => s.quizId === q.id);
    const completions = quizSubs.filter(s => s.status === 'completed').length;
    return {
      ...q,
      submissions: quizSubs.length,
      completions,
      rate: quizSubs.length > 0 ? (completions / quizSubs.length) * 100 : 0
    };
  }).sort((a, b) => b.submissions - a.submissions);

  const topQuiz = quizPerformance[0];

  const chartData = [
    { name: 'Mon', leads: 4 },
    { name: 'Tue', leads: 7 },
    { name: 'Wed', leads: 3 },
    { name: 'Thu', leads: 8 },
    { name: 'Fri', leads: 12 },
    { name: 'Sat', leads: 5 },
    { name: 'Sun', leads: 9 },
  ];
  
  const outcomeData = [
    { name: 'High Risk', value: 40, color: 'hsl(var(--destructive))' },
    { name: 'Medium Risk', value: 35, color: 'hsl(var(--chart-4))' },
    { name: 'Low Risk', value: 25, color: 'hsl(var(--chart-2))' },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-muted-foreground">Real-time overview of your assessment performance.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/quizzes/compare">
            <Button variant="outline">Compare Quizzes</Button>
          </Link>
          <Link href="/admin/quizzes/new">
            <Button>+ New Quiz</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +12.5% vs last month
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedSubmissions}</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +8.2% vs last month
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Completion</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgCompletionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Industry avg: 55%
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Quizzes</CardTitle>
            <CheckCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quizzes.filter(q => q.published).length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalQuizzes} total drafts
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mb-8">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Lead Generation Velocity</CardTitle>
            <CardDescription>Daily lead capture across all active quizzes.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="leads" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorLeads)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>Outcome Distribution</CardTitle>
            <CardDescription>Risk profile categorization of recent leads.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="h-[300px] flex items-center justify-center relative">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={outcomeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {outcomeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                 </PieChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                 <span className="text-3xl font-bold">{completedSubmissions}</span>
                 <span className="text-xs text-muted-foreground uppercase tracking-wide">Results</span>
               </div>
             </div>
             <div className="flex justify-center gap-4 mt-4 text-xs text-muted-foreground">
                {outcomeData.map(item => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </div>
                ))}
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
         <Card>
           <CardHeader>
             <CardTitle>Recent Activity Feed</CardTitle>
           </CardHeader>
           <CardContent>
            <div className="space-y-6">
              {submissions.slice(0, 5).map((sub) => (
                <div key={sub.id} className="flex items-center pb-4 border-b last:border-0 last:pb-0">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {sub.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{sub.email || 'Anonymous User'}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.status === 'completed' ? 'Completed' : 'Started'} {sub.quizId} • Score: {sub.score ?? '-'}
                    </p>
                  </div>
                  <div className="ml-auto font-medium text-sm">
                    {sub.paid ? <Badge variant="default" className="bg-green-600">Paid</Badge> : <Badge variant="secondary">Free</Badge>}
                  </div>
                </div>
              ))}
              {submissions.length === 0 && <div className="text-center text-muted-foreground py-8">No submissions yet.</div>}
            </div>
           </CardContent>
         </Card>

         <Card>
           <CardHeader>
             <CardTitle>Top Performing Quiz</CardTitle>
             <CardDescription>Based on completion volume.</CardDescription>
           </CardHeader>
           <CardContent className="space-y-6">
             {topQuiz ? (
               <>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${topQuiz.image})` }} />
                  <div>
                    <h3 className="font-bold text-lg">{topQuiz.title}</h3>
                    <p className="text-muted-foreground text-sm">{topQuiz.submissions} total starts</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Completion Rate</span>
                    <span className="font-bold">{topQuiz.rate.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${topQuiz.rate}%` }} />
                  </div>
                </div>

                <div className="pt-4 flex gap-2">
                  <Link href={`/admin/quizzes/${topQuiz.id}`}>
                    <Button className="w-full" variant="outline">Manage Quiz</Button>
                  </Link>
                  <Link href={`/admin/quiz/${topQuiz.id}/dashboard`}>
                     <Button className="w-full">View Analytics</Button>
                  </Link>
                </div>
               </>
             ) : (
               <div className="text-center py-10 text-muted-foreground">No quizzes found.</div>
             )}
           </CardContent>
         </Card>
      </div>
    </AdminLayout>
  );
}
