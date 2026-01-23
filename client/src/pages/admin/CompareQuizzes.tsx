import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { storage } from "@/lib/storage";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function CompareQuizzes() {
  const quizzes = storage.getQuizzes();
  const submissions = storage.getSubmissions();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggle = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getStats = (quizId: string) => {
    const quiz = quizzes.find(q => q.id === quizId);
    const quizSubs = submissions.filter(s => s.quizId === quizId);
    const starts = quizSubs.length;
    const completions = quizSubs.filter(s => s.status === 'completed').length;
    const rate = starts > 0 ? (completions / starts) * 100 : 0;
    const revenue = quizSubs.reduce((acc, sub) => acc + (sub.paid ? (quiz?.price || 0) : 0), 0);
    return { starts, completions, rate, revenue, title: quiz?.title || '' };
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Compare Quizzes</h1>
          <p className="text-muted-foreground">Select quizzes to analyze side-by-side.</p>
        </div>

        <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-background">
          {quizzes.map(q => (
            <div key={q.id} className="flex items-center space-x-2">
              <Checkbox 
                id={q.id} 
                checked={selectedIds.includes(q.id)}
                onCheckedChange={() => handleToggle(q.id)}
              />
              <Label htmlFor={q.id} className="cursor-pointer">{q.title}</Label>
            </div>
          ))}
        </div>

        {selectedIds.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
             {selectedIds.map(id => {
               const stats = getStats(id);
               return (
                 <Card key={id} className="border-t-4 border-t-primary">
                   <CardHeader>
                     <CardTitle className="text-lg min-h-[50px]">{stats.title}</CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-4">
                     <div className="flex justify-between items-center py-2 border-b">
                       <span className="text-muted-foreground">Starts</span>
                       <span className="font-bold text-lg">{stats.starts}</span>
                     </div>
                     <div className="flex justify-between items-center py-2 border-b">
                       <span className="text-muted-foreground">Completions</span>
                       <span className="font-bold text-lg">{stats.completions}</span>
                     </div>
                     <div className="flex justify-between items-center py-2 border-b">
                       <span className="text-muted-foreground">Completion Rate</span>
                       <span className={`font-bold text-lg ${stats.rate > 50 ? 'text-green-600' : 'text-orange-500'}`}>
                         {stats.rate.toFixed(1)}%
                       </span>
                     </div>
                     <div className="flex justify-between items-center py-2 border-b">
                       <span className="text-muted-foreground">Revenue</span>
                       <span className="font-bold text-lg text-primary">${stats.revenue.toFixed(2)}</span>
                     </div>
                   </CardContent>
                 </Card>
               );
             })}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Select at least one quiz to view stats.</p>
          </div>
        )}
        
        {/* A/B Testing Scaffold */}
        <div className="mt-12 pt-12 border-t">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-xl font-bold">A/B Testing</h2>
            <Badge variant="outline" className="text-muted-foreground">Coming Soon</Badge>
          </div>
          <div className="grid md:grid-cols-2 gap-8 opacity-50 pointer-events-none select-none grayscale">
            <Card>
              <CardHeader><CardTitle>Variant A (Control)</CardTitle></CardHeader>
              <CardContent className="h-32 bg-muted"></CardContent>
            </Card>
            <Card>
               <CardHeader><CardTitle>Variant B (Test)</CardTitle></CardHeader>
               <CardContent className="h-32 bg-muted"></CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
