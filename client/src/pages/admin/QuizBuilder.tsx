import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { storage } from "@/lib/storage";
import { useRoute, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Save, Plus, Trash2, GripVertical, Eye, FileText, DollarSign, Percent } from "lucide-react";
import { Quiz, Question } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";
import { nanoid } from 'nanoid';

export default function QuizBuilder({ isNew }: { isNew?: boolean }) {
  const [, params] = useRoute("/admin/quizzes/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const quizId = params?.id;

  const [quiz, setQuiz] = useState<Quiz | null>(null);

  useEffect(() => {
    if (isNew) {
      setQuiz({
        id: `quiz-${Date.now()}`,
        orgId: 'org-1',
        title: 'New Quiz',
        description: 'Describe your quiz here',
        slug: `new-quiz-${Date.now()}`,
        published: false,
        gateResults: false,
        price: 0,
        questions: [],
        views: 0
      });
    } else if (quizId) {
      const found = storage.getQuizzes().find(q => q.id === quizId);
      if (found) setQuiz(found);
    }
  }, [isNew, quizId]);

  if (!quiz) return <div>Loading...</div>;

  const handleSave = () => {
    storage.saveQuiz(quiz);
    toast({ title: "Quiz Saved", description: "Your changes have been persisted." });
    if (isNew) {
      setLocation(`/admin/quizzes/${quiz.id}`);
    }
  };

  const updateField = (field: keyof Quiz, value: any) => {
    setQuiz(prev => prev ? { ...prev, [field]: value } : null);
  };

  const addQuestion = () => {
    setQuiz(prev => {
      if (!prev) return null;
      const newQ: Question = {
        id: `q-${Date.now()}`,
        text: "New Question",
        type: 'single',
        options: [
          { id: `opt-${Date.now()}-1`, text: "Option 1", value: 0 },
          { id: `opt-${Date.now()}-2`, text: "Option 2", value: 0 },
        ]
      };
      return { ...prev, questions: [...prev.questions, newQ] };
    });
  };

  const updateQuestion = (qId: string, field: keyof Question, value: any) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => q.id === qId ? { ...q, [field]: value } : q)
      };
    });
  };

  const deleteQuestion = (qId: string) => {
    setQuiz(prev => prev ? { ...prev, questions: prev.questions.filter(q => q.id !== qId) } : null);
  };

  const updateOption = (qId: string, optId: string, field: string, value: any) => {
     setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
            ...q,
            options: q.options?.map(opt => opt.id === optId ? { ...opt, [field]: value } : opt)
          };
        })
      };
    });
  };

  const addOption = (qId: string) => {
     setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
            ...q,
            options: [...(q.options || []), { id: `opt-${Date.now()}`, text: "New Option", value: 0 }]
          };
        })
      };
    });
  };
  
  const deleteOption = (qId: string, optId: string) => {
     setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
            ...q,
            options: q.options?.filter(opt => opt.id !== optId)
          };
        })
      };
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-4 border-b mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{isNew ? "Create Quiz" : "Edit Quiz"}</h1>
          <p className="text-muted-foreground">{quiz.title}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open(`/quiz/${quiz.slug}`, '_blank')}>
            <Eye className="mr-2 h-4 w-4" /> Preview
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" /> Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="questions" className="space-y-6">
        <TabsList className="w-full justify-start h-12 p-1 bg-muted/50">
          <TabsTrigger value="settings" className="h-10 px-6">General Settings</TabsTrigger>
          <TabsTrigger value="questions" className="h-10 px-6">Questions ({quiz.questions.length})</TabsTrigger>
          <TabsTrigger value="results" className="h-10 px-6">Results & Paywall</TabsTrigger>
          <TabsTrigger value="design" className="h-10 px-6">Design</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure the public facing details of your quiz.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Quiz Title</Label>
                <Input 
                  id="title" 
                  value={quiz.title} 
                  onChange={(e) => updateField('title', e.target.value)} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">URL Slug</Label>
                <div className="flex">
                  <span className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted text-muted-foreground text-sm">
                    quizproquo.com/quiz/
                  </span>
                  <Input 
                    id="slug" 
                    value={quiz.slug} 
                    onChange={(e) => updateField('slug', e.target.value)}
                    className="rounded-l-none" 
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea 
                  id="desc" 
                  value={quiz.description} 
                  onChange={(e) => updateField('description', e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex items-center justify-between border p-4 rounded-lg">
                <div>
                  <Label>Published Status</Label>
                  <p className="text-sm text-muted-foreground">Make this quiz visible to the public.</p>
                </div>
                <Switch 
                  checked={quiz.published} 
                  onCheckedChange={(c) => updateField('published', c)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-6 max-w-4xl">
          <div className="space-y-4">
            {quiz.questions.map((q, idx) => (
              <Card key={q.id} className="group relative border-muted-foreground/20 hover:border-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 py-4">
                  <div className="mt-2 text-muted-foreground cursor-grab active:cursor-grabbing hover:text-foreground">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="font-bold text-sm bg-muted px-2.5 py-1.5 rounded-md mt-1">Q{idx + 1}</span>
                      <Textarea 
                        value={q.text} 
                        onChange={(e) => updateQuestion(q.id, 'text', e.target.value)}
                        className="font-medium text-lg min-h-[80px] resize-none bg-transparent" 
                        placeholder="Enter your question text here..."
                      />
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteQuestion(q.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="pl-16 pr-16 pb-8">
                  <div className="space-y-3">
                    {q.options?.map((opt, optIdx) => (
                      <div key={opt.id} className="flex items-center gap-3 group/opt">
                        <div className="w-4 h-4 rounded-full border border-primary/20 shrink-0" />
                        <Input 
                          value={opt.text} 
                          onChange={(e) => updateOption(q.id, opt.id, 'text', e.target.value)}
                          className="flex-1"
                          placeholder="Answer option text"
                        />
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Score</Label>
                          <Input 
                            value={opt.value} 
                            onChange={(e) => updateOption(q.id, opt.id, 'value', Number(e.target.value))}
                            className="w-16 text-center" 
                            type="number" 
                          />
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-muted-foreground hover:text-destructive opacity-0 group-hover/opt:opacity-100 transition-opacity"
                          onClick={() => deleteOption(q.id, opt.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="mt-2 text-primary hover:text-primary hover:bg-primary/5" onClick={() => addOption(q.id)}>
                      <Plus className="h-4 w-4 mr-2" /> Add Option
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            <Button onClick={addQuestion} className="w-full py-8 border-dashed bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground" variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Add New Question
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                Stripe Paywall
              </CardTitle>
              <CardDescription>Monetize your quiz by gating the results or PDF report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Gate Results Page</Label>
                  <p className="text-sm text-muted-foreground">
                    Users must pay before seeing their score/outcome.
                  </p>
                </div>
                <Switch 
                  checked={quiz.gateResults} 
                  onCheckedChange={(c) => updateField('gateResults', c)}
                />
              </div>
              
              {quiz.gateResults && (
                 <div className="space-y-6 animate-in slide-in-from-top-2">
                   <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="price">Price (USD)</Label>
                      <Input 
                        id="price" 
                        type="number" 
                        value={quiz.price} 
                        onChange={(e) => updateField('price', Number(e.target.value))}
                      />
                    </div>
                    {quiz.discountEnabled && (
                      <div className="grid gap-2">
                        <Label htmlFor="originalPrice">Original Price</Label>
                        <Input 
                          id="originalPrice" 
                          type="number" 
                          value={quiz.originalPrice} 
                          onChange={(e) => updateField('originalPrice', Number(e.target.value))}
                        />
                      </div>
                    )}
                   </div>

                   <div className="flex items-center justify-between space-x-2">
                      <div className="space-y-0.5">
                        <Label className="text-base">Enable Discount</Label>
                        <p className="text-sm text-muted-foreground">
                          Show a slashed original price to increase conversion.
                        </p>
                      </div>
                      <Switch 
                        checked={quiz.discountEnabled} 
                        onCheckedChange={(c) => updateField('discountEnabled', c)}
                      />
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                PDF Report Settings
              </CardTitle>
              <CardDescription>Configure the automated PDF that is generated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Report Title</Label>
                <Input placeholder="Your Personal Assessment Report" defaultValue={`${quiz.title} Report`} />
              </div>
              <div className="grid gap-2">
                 <Label>Disclaimer Text</Label>
                 <Textarea placeholder="This report is for informational purposes only..." />
              </div>
              <Button variant="outline" className="w-full">
                <Eye className="w-4 h-4 mr-2" /> Preview PDF Template
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="design">
           <Card>
             <CardHeader>
               <CardTitle>Coming Soon</CardTitle>
               <CardDescription>Visual editor for colors, fonts, and layouts.</CardDescription>
             </CardHeader>
             <CardContent className="h-64 flex items-center justify-center bg-muted/20">
               <p className="text-muted-foreground">Use global theme settings for now.</p>
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
