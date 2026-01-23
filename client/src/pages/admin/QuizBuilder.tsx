import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MOCK_QUIZZES } from "@/lib/mock-data";
import { useRoute } from "wouter";
import { useState } from "react";
import { Save, Plus, Trash2, GripVertical } from "lucide-react";

export default function QuizBuilder() {
  const [, params] = useRoute("/admin/quizzes/:id");
  const quizId = params?.id;
  
  // In a real app, we'd fetch this. Mocking state for now.
  const [quiz, setQuiz] = useState(
    MOCK_QUIZZES.find(q => q.id === quizId) || MOCK_QUIZZES[0]
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Quiz Builder</h1>
          <p className="text-muted-foreground">Editing: {quiz.title}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Preview</Button>
          <Button>
            <Save className="mr-2 h-4 w-4" /> Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">General Settings</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="results">Results & Paywall</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure the public facing details of your quiz.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Quiz Title</Label>
                <Input id="title" defaultValue={quiz.title} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">URL Slug</Label>
                <div className="flex">
                  <span className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted text-muted-foreground text-sm">
                    quizproquo.com/quiz/
                  </span>
                  <Input id="slug" defaultValue={quiz.slug} className="rounded-l-none" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" defaultValue={quiz.description} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <div className="space-y-4">
            {quiz.questions.map((q, idx) => (
              <Card key={q.id}>
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 py-4">
                  <div className="mt-1 text-muted-foreground cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm bg-muted px-2 py-0.5 rounded">Q{idx + 1}</span>
                      <Input defaultValue={q.text} className="font-medium" />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="pl-14">
                  <div className="space-y-2">
                    {q.options?.map((opt, optIdx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-primary/20" />
                        <Input defaultValue={opt.text} className="h-9" />
                        <Input defaultValue={opt.value} className="h-9 w-20" type="number" placeholder="Score" />
                        <Button variant="ghost" size="icon" className="h-9 w-9">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="mt-2 text-primary">
                      <Plus className="h-4 w-4 mr-2" /> Add Option
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            <Button className="w-full py-8 border-dashed" variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Add New Question
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stripe Paywall</CardTitle>
              <CardDescription>Monetize your quiz by gating the results or PDF report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label className="text-base">Gate Results Page</Label>
                  <p className="text-sm text-muted-foreground">
                    Users must pay before seeing their score/outcome.
                  </p>
                </div>
                <Switch checked={quiz.gateResults} />
              </div>
              
              {quiz.gateResults && (
                 <div className="grid gap-2">
                  <Label htmlFor="price">Price (USD)</Label>
                  <Input id="price" type="number" defaultValue={quiz.price} className="max-w-[200px]" />
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>PDF Report</CardTitle>
              <CardDescription>Configure the automated PDF that is generated.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline">Edit PDF Template</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
