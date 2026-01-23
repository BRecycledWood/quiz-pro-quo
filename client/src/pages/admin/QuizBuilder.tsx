import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { storage } from "@/lib/storage";
import { useRoute, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Save, Plus, Trash2, GripVertical, Eye, FileText, DollarSign, Percent, Calculator, AlertTriangle, ArrowRight } from "lucide-react";
import { Quiz, Question, QuestionType, CalculatedField, KnockoutRule, BranchingRule } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";

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
        calculatedFields: [],
        knockoutRules: [],
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

  // --- Questions Logic ---

  const addQuestion = () => {
    setQuiz(prev => {
      if (!prev) return null;
      const newQ: Question = {
        id: `q-${Date.now()}`,
        text: "New Question",
        type: 'single',
        variableName: `q${prev.questions.length + 1}`,
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

  // --- Options Logic ---

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

  // --- Branching Logic ---
  
  const addBranchingRule = (qId: string) => {
    setQuiz(prev => {
      if (!prev) return null;
      const newRule: BranchingRule = {
        id: `rule-${Date.now()}`,
        condition: 'equals',
        value: '',
        nextQuestionId: ''
      };
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return { ...q, branchingRules: [...(q.branchingRules || []), newRule] };
        })
      };
    });
  };

  const updateBranchingRule = (qId: string, ruleId: string, field: keyof BranchingRule, value: any) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
            ...q,
            branchingRules: q.branchingRules?.map(r => r.id === ruleId ? { ...r, [field]: value } : r)
          };
        })
      };
    });
  };
  
  const deleteBranchingRule = (qId: string, ruleId: string) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
             ...q,
             branchingRules: q.branchingRules?.filter(r => r.id !== ruleId)
          };
        })
      };
    });
  };

  // --- Calculated Fields Logic ---

  const addCalculatedField = () => {
    setQuiz(prev => {
      if (!prev) return null;
      const newField: CalculatedField = {
        id: `cf-${Date.now()}`,
        name: 'New Field',
        variable: `var_${Date.now()}`,
        formula: ''
      };
      return { ...prev, calculatedFields: [...(prev.calculatedFields || []), newField] };
    });
  };

  const updateCalculatedField = (cfId: string, field: keyof CalculatedField, value: string) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        calculatedFields: prev.calculatedFields?.map(cf => cf.id === cfId ? { ...cf, [field]: value } : cf)
      };
    });
  };
  
  const deleteCalculatedField = (cfId: string) => {
     setQuiz(prev => prev ? { ...prev, calculatedFields: prev.calculatedFields?.filter(cf => cf.id !== cfId) } : null);
  };

  // --- Knockout Rules Logic ---

  const addKnockoutRule = () => {
    setQuiz(prev => {
      if (!prev) return null;
      const newRule: KnockoutRule = {
        id: `kr-${Date.now()}`,
        name: 'New Rule',
        logic: '',
        message: 'You do not qualify at this time.'
      };
      return { ...prev, knockoutRules: [...(prev.knockoutRules || []), newRule] };
    });
  };

  const updateKnockoutRule = (krId: string, field: keyof KnockoutRule, value: string) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        knockoutRules: prev.knockoutRules?.map(kr => kr.id === krId ? { ...kr, [field]: value } : kr)
      };
    });
  };

  const deleteKnockoutRule = (krId: string) => {
    setQuiz(prev => prev ? { ...prev, knockoutRules: prev.knockoutRules?.filter(kr => kr.id !== krId) } : null);
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
          <TabsTrigger value="questions" className="h-10 px-6">Questions</TabsTrigger>
          <TabsTrigger value="logic" className="h-10 px-6">Logic & Calc</TabsTrigger>
          <TabsTrigger value="results" className="h-10 px-6">Results & Paywall</TabsTrigger>
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
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-8">
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
                      <div className="col-span-4 space-y-2">
                         <Select 
                            value={q.type} 
                            onValueChange={(val) => updateQuestion(q.id, 'type', val)}
                         >
                           <SelectTrigger>
                             <SelectValue placeholder="Question Type" />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="single">Single Select</SelectItem>
                             <SelectItem value="multiple">Multi Select</SelectItem>
                             <SelectItem value="yes_no">Yes / No</SelectItem>
                             <SelectItem value="short_text">Short Text</SelectItem>
                             <SelectItem value="long_text">Long Text</SelectItem>
                             <SelectItem value="number">Number</SelectItem>
                             <SelectItem value="percent">Percent</SelectItem>
                             <SelectItem value="scale">Scale (1-10)</SelectItem>
                           </SelectContent>
                         </Select>
                         <Input 
                            placeholder="Variable Name (for formulas)" 
                            value={q.variableName || ''}
                            onChange={(e) => updateQuestion(q.id, 'variableName', e.target.value)}
                            className="font-mono text-xs bg-muted/50"
                         />
                      </div>
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
                
                {['single', 'multiple', 'select'].includes(q.type) && (
                  <CardContent className="pl-16 pr-16 pb-4">
                    <div className="space-y-3">
                      {q.options?.map((opt, optIdx) => (
                        <div key={opt.id} className="flex items-center gap-3 group/opt">
                          <div className={`w-4 h-4 border border-primary/20 shrink-0 ${q.type === 'single' ? 'rounded-full' : 'rounded'}`} />
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
                )}

                <CardContent className="pl-16 pr-16 pb-8 pt-0 border-t mt-4">
                   <div className="mt-4 space-y-3">
                     <Label className="text-xs font-bold text-muted-foreground uppercase">Branching Logic</Label>
                     {q.branchingRules?.map((rule, rIdx) => (
                        <div key={rule.id} className="flex items-center gap-2 bg-muted/30 p-2 rounded-md">
                           <span className="text-xs font-mono">IF Answer</span>
                           <Select value={rule.condition} onValueChange={(v) => updateBranchingRule(q.id, rule.id, 'condition', v)}>
                              <SelectTrigger className="w-[120px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                <SelectItem value="greater_than">Greater Than</SelectItem>
                                <SelectItem value="less_than">Less Than</SelectItem>
                              </SelectContent>
                           </Select>
                           <Input 
                              className="h-8 text-xs w-[120px]" 
                              placeholder="Value..." 
                              value={rule.value}
                              onChange={(e) => updateBranchingRule(q.id, rule.id, 'value', e.target.value)}
                           />
                           <span className="text-xs font-mono">JUMP TO</span>
                           <Select value={rule.nextQuestionId} onValueChange={(v) => updateBranchingRule(q.id, rule.id, 'nextQuestionId', v)}>
                              <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue placeholder="Select Question" />
                              </SelectTrigger>
                              <SelectContent>
                                {quiz.questions.map((targetQ, tIdx) => (
                                  targetQ.id !== q.id && (
                                    <SelectItem key={targetQ.id} value={targetQ.id}>
                                       {tIdx + 1}. {targetQ.text.substring(0, 20)}...
                                    </SelectItem>
                                  )
                                ))}
                                <SelectItem value="finish">End of Quiz</SelectItem>
                              </SelectContent>
                           </Select>
                           <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteBranchingRule(q.id, rule.id)}>
                             <Trash2 className="w-3 h-3" />
                           </Button>
                        </div>
                     ))}
                     <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addBranchingRule(q.id)}>
                       <Plus className="w-3 h-3 mr-1" /> Add Rule
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

        <TabsContent value="logic" className="space-y-6">
           {/* Calculated Fields */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Calculator className="w-5 h-5 text-primary" />
                 Calculated Fields
               </CardTitle>
               <CardDescription>Define formulas using your question variables (e.g. `q1_value / q2_value`).</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                {quiz.calculatedFields?.map((cf) => (
                  <div key={cf.id} className="grid grid-cols-12 gap-4 items-center border p-4 rounded-lg bg-background">
                     <div className="col-span-3">
                        <Label className="text-xs">Field Name</Label>
                        <Input value={cf.name} onChange={(e) => updateCalculatedField(cf.id, 'name', e.target.value)} />
                     </div>
                     <div className="col-span-3">
                        <Label className="text-xs">Variable Name</Label>
                        <Input value={cf.variable} onChange={(e) => updateCalculatedField(cf.id, 'variable', e.target.value)} className="font-mono" />
                     </div>
                     <div className="col-span-5">
                        <Label className="text-xs">Formula</Label>
                        <Input value={cf.formula} onChange={(e) => updateCalculatedField(cf.id, 'formula', e.target.value)} className="font-mono bg-muted/50" placeholder="e.g. income / members" />
                     </div>
                     <div className="col-span-1 flex justify-end mt-4">
                        <Button variant="ghost" size="icon" onClick={() => deleteCalculatedField(cf.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                     </div>
                  </div>
                ))}
                <Button variant="outline" onClick={addCalculatedField}>
                  <Plus className="w-4 h-4 mr-2" /> Add Calculated Field
                </Button>
             </CardContent>
           </Card>
           
           {/* Knockout Rules */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <AlertTriangle className="w-5 h-5 text-orange-500" />
                 Knockout Rules
               </CardTitle>
               <CardDescription>Stop the user if they meet certain criteria.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
               {quiz.knockoutRules?.map((kr) => (
                  <div key={kr.id} className="border p-4 rounded-lg bg-background space-y-4">
                     <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-4">
                           <Label className="text-xs">Rule Name</Label>
                           <Input value={kr.name} onChange={(e) => updateKnockoutRule(kr.id, 'name', e.target.value)} />
                        </div>
                        <div className="col-span-8">
                           <Label className="text-xs">Logic Condition (JS Expression)</Label>
                           <Input value={kr.logic} onChange={(e) => updateKnockoutRule(kr.id, 'logic', e.target.value)} className="font-mono bg-muted/50" placeholder="e.g. age < 18 || risk_score > 80" />
                        </div>
                     </div>
                     <div>
                        <Label className="text-xs">Failure Message</Label>
                        <Textarea value={kr.message} onChange={(e) => updateKnockoutRule(kr.id, 'message', e.target.value)} />
                     </div>
                     <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteKnockoutRule(kr.id)}>
                          <Trash2 className="w-3 h-3 mr-2" /> Delete Rule
                        </Button>
                     </div>
                  </div>
               ))}
               <Button variant="outline" onClick={addKnockoutRule}>
                  <Plus className="w-4 h-4 mr-2" /> Add Knockout Rule
               </Button>
             </CardContent>
           </Card>
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
