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
import { Save, Plus, Trash2, GripVertical, Eye, FileText, DollarSign, Percent, Calculator, AlertTriangle, ArrowRight, Settings, List, GitBranch } from "lucide-react";
import { Quiz, Question, QuestionType, CalculatedField, Outcome, BranchingRule, AnswerOption } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";
import { nanoid } from 'nanoid';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'true_false', label: 'True / False' },
  { value: 'single', label: 'Single Select' },
  { value: 'multi', label: 'Multi Select' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent (0-100)' },
  { value: 'scale_1_5', label: 'Scale 1-5' },
  { value: 'scale_1_10', label: 'Scale 1-10' },
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'date', label: 'Date' },
];

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
        outcomes: [],
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
        id: `q-${nanoid(6)}`,
        text: "New Question",
        type: 'single',
        key: `q_${prev.questions.length + 1}`,
        required: true,
        options: [
          { id: `opt-${nanoid(4)}`, label: "Option 1", value: "opt1" },
          { id: `opt-${nanoid(4)}`, label: "Option 2", value: "opt2" },
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

  const addOption = (qId: string) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
            ...q,
            options: [...(q.options || []), { id: `opt-${nanoid(4)}`, label: "New Option", value: "" }]
          };
        })
      };
    });
  };

  const updateOption = (qId: string, optId: string, field: keyof AnswerOption, value: any) => {
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
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          const newRule: BranchingRule = {
            id: `br-${nanoid(4)}`,
            condition: 'equals',
            value: '',
            targetQuestionId: ''
          };
          return { ...q, branchingRules: [...(q.branchingRules || []), newRule] };
        })
      };
    });
  };

  const updateBranchingRule = (qId: string, rId: string, field: keyof BranchingRule, value: any) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return {
            ...q,
            branchingRules: q.branchingRules?.map(r => r.id === rId ? { ...r, [field]: value } : r)
          };
        })
      };
    });
  };

  const deleteBranchingRule = (qId: string, rId: string) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        questions: prev.questions.map(q => {
          if (q.id !== qId) return q;
          return { ...q, branchingRules: q.branchingRules?.filter(r => r.id !== rId) };
        })
      };
    });
  };

  // --- Calculated Fields Logic ---

  const addCalculatedField = () => {
    setQuiz(prev => {
      if (!prev) return null;
      const newField: CalculatedField = {
        id: `cf-${nanoid(4)}`,
        label: 'New Field',
        key: `calc_${prev.calculatedFields.length + 1}`,
        type: 'number',
        expression: ''
      };
      return { ...prev, calculatedFields: [...prev.calculatedFields, newField] };
    });
  };

  const updateCalculatedField = (cfId: string, field: keyof CalculatedField, value: any) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        calculatedFields: prev.calculatedFields.map(cf => cf.id === cfId ? { ...cf, [field]: value } : cf)
      };
    });
  };

  const deleteCalculatedField = (cfId: string) => {
    setQuiz(prev => prev ? { ...prev, calculatedFields: prev.calculatedFields.filter(cf => cf.id !== cfId) } : null);
  };

  // --- Rules/Outcomes Logic ---

  const addOutcome = () => {
    setQuiz(prev => {
      if (!prev) return null;
      const newOutcome: Outcome = {
        id: `rule-${nanoid(4)}`,
        type: 'knockout',
        label: 'New Rule',
        message: 'Message here...',
        severity: 'fail',
        condition: ''
      };
      return { ...prev, outcomes: [...prev.outcomes, newOutcome] };
    });
  };

  const updateOutcome = (oId: string, field: keyof Outcome, value: any) => {
    setQuiz(prev => {
      if (!prev) return null;
      return {
        ...prev,
        outcomes: prev.outcomes.map(o => o.id === oId ? { ...o, [field]: value } : o)
      };
    });
  };

  const deleteOutcome = (oId: string) => {
    setQuiz(prev => prev ? { ...prev, outcomes: prev.outcomes.filter(o => o.id !== oId) } : null);
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-4 border-b mb-6 px-6">
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

      <div className="px-6 pb-20">
        <Tabs defaultValue="questions" className="space-y-6">
          <TabsList className="w-full justify-start h-12 p-1 bg-muted/50">
            <TabsTrigger value="settings" className="h-10 px-6 gap-2"><Settings className="w-4 h-4"/> Settings</TabsTrigger>
            <TabsTrigger value="questions" className="h-10 px-6 gap-2"><List className="w-4 h-4"/> Questions</TabsTrigger>
            <TabsTrigger value="logic" className="h-10 px-6 gap-2"><Calculator className="w-4 h-4"/> Logic & Calc</TabsTrigger>
            <TabsTrigger value="rules" className="h-10 px-6 gap-2"><AlertTriangle className="w-4 h-4"/> Rules</TabsTrigger>
            <TabsTrigger value="results" className="h-10 px-6 gap-2"><DollarSign className="w-4 h-4"/> Paywall</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>Quiz Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Title</Label>
                  <Input value={quiz.title} onChange={e => updateField('title', e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea value={quiz.description} onChange={e => updateField('description', e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Slug</Label>
                  <Input value={quiz.slug} onChange={e => updateField('slug', e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={quiz.published} onCheckedChange={c => updateField('published', c)} />
                  <Label>Published</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="questions" className="space-y-6 max-w-5xl">
            {quiz.questions.map((q, idx) => (
              <Card key={q.id} className="relative">
                <CardHeader className="flex flex-row items-start gap-4">
                  <div className="mt-2 text-muted-foreground cursor-grab"><GripVertical className="h-5 w-5"/></div>
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-8 space-y-2">
                        <Label>Question Text</Label>
                        <Textarea 
                          value={q.text} 
                          onChange={e => updateQuestion(q.id, 'text', e.target.value)} 
                          className="min-h-[80px] text-lg font-medium"
                        />
                      </div>
                      <div className="col-span-4 space-y-2">
                        <Label>Type</Label>
                        <Select value={q.type} onValueChange={v => updateQuestion(q.id, 'type', v)}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Input 
                            placeholder="Variable Key (e.g. unit_count)" 
                            value={q.key} 
                            onChange={e => updateQuestion(q.id, 'key', e.target.value)}
                            className="font-mono text-xs"
                          />
                          <div className="flex items-center gap-2 border px-2 rounded">
                            <Switch checked={q.required} onCheckedChange={c => updateQuestion(q.id, 'required', c)} id={`req-${q.id}`}/>
                            <Label htmlFor={`req-${q.id}`} className="text-xs">Req</Label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Answer Options */}
                    {['single', 'multi', 'dropdown'].includes(q.type) && (
                      <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Answer Options</Label>
                        {q.options?.map(opt => (
                          <div key={opt.id} className="flex gap-2 items-center">
                            <Input 
                              placeholder="Label" 
                              value={opt.label} 
                              onChange={e => updateOption(q.id, opt.id, 'label', e.target.value)}
                              className="flex-1"
                            />
                            <Input 
                              placeholder="Value" 
                              value={opt.value} 
                              onChange={e => updateOption(q.id, opt.id, 'value', e.target.value)}
                              className="w-32 font-mono"
                            />
                            <Input 
                              type="number" 
                              placeholder="Pts" 
                              value={opt.points || 0} 
                              onChange={e => updateOption(q.id, opt.id, 'points', parseFloat(e.target.value))}
                              className="w-20"
                            />
                            <Button variant="ghost" size="icon" onClick={() => deleteOption(q.id, opt.id)}><Trash2 className="w-4 h-4"/></Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => addOption(q.id)}><Plus className="w-3 h-3 mr-2"/> Add Option</Button>
                      </div>
                    )}

                    {/* Branching */}
                    <div className="pt-2 border-t mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground flex gap-2 items-center">
                          <GitBranch className="w-3 h-3"/> Logic & Branching
                        </Label>
                      </div>
                      
                      <div className="space-y-2">
                        {q.branchingRules?.map(rule => (
                          <div key={rule.id} className="flex gap-2 items-center bg-muted/20 p-2 rounded">
                            <span className="text-xs">IF Answer</span>
                            <Select value={rule.condition} onValueChange={v => updateBranchingRule(q.id, rule.id, 'condition', v)}>
                              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue/></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                <SelectItem value="greater_than">&gt;</SelectItem>
                                <SelectItem value="less_than">&lt;</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input 
                              value={rule.value} 
                              onChange={e => updateBranchingRule(q.id, rule.id, 'value', e.target.value)}
                              className="w-32 h-8 text-xs" 
                              placeholder="Value"
                            />
                            <span className="text-xs">GOTO</span>
                            <Select value={rule.targetQuestionId} onValueChange={v => updateBranchingRule(q.id, rule.id, 'targetQuestionId', v)}>
                              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Select target..."/></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="finish">End Quiz</SelectItem>
                                {quiz.questions.filter(target => target.id !== q.id).map(target => (
                                  <SelectItem key={target.id} value={target.id}>{target.text.substring(0, 30)}...</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteBranchingRule(q.id, rule.id)}><Trash2 className="w-3 h-3"/></Button>
                          </div>
                        ))}
                        <div className="flex gap-4 items-center">
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => addBranchingRule(q.id)}><Plus className="w-3 h-3 mr-1"/> Add Rule</Button>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                            <span>Default Next:</span>
                            <Select value={q.defaultNextQuestionId || "next"} onValueChange={v => updateQuestion(q.id, 'defaultNextQuestionId', v)}>
                              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue/></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="next">Next in Order</SelectItem>
                                <SelectItem value="finish">End Quiz</SelectItem>
                                {quiz.questions.filter(target => target.id !== q.id).map(target => (
                                  <SelectItem key={target.id} value={target.id}>{target.text.substring(0, 30)}...</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4"/>
                  </Button>
                </CardHeader>
              </Card>
            ))}
            <Button onClick={addQuestion} className="w-full h-16 border-dashed" variant="outline"><Plus className="mr-2"/> Add Question</Button>
          </TabsContent>

          <TabsContent value="logic" className="space-y-6 max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle>Calculated Fields</CardTitle>
                <CardDescription>Create variables derived from answers. Reference them as <code>calc.field_key</code></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {quiz.calculatedFields.map(cf => (
                  <div key={cf.id} className="grid grid-cols-12 gap-2 items-start border p-3 rounded bg-muted/10">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input value={cf.label} onChange={e => updateCalculatedField(cf.id, 'label', e.target.value)} />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Key (snake_case)</Label>
                      <Input value={cf.key} onChange={e => updateCalculatedField(cf.id, 'key', e.target.value)} className="font-mono"/>
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Expression (JS syntax, use keys)</Label>
                      <Input value={cf.expression} onChange={e => updateCalculatedField(cf.id, 'expression', e.target.value)} className="font-mono" placeholder="e.g. q1_val / q2_val"/>
                    </div>
                    <div className="col-span-1 pt-6 text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteCalculatedField(cf.id)}><Trash2 className="w-4 h-4"/></Button>
                    </div>
                  </div>
                ))}
                <Button onClick={addCalculatedField} variant="outline" size="sm"><Plus className="w-4 h-4 mr-2"/> Add Field</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-6 max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle>Rules & Outcomes</CardTitle>
                <CardDescription>Define Knockout logic and Result Thresholds. Rules run top-to-bottom.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {quiz.outcomes.map(rule => (
                  <div key={rule.id} className={`border p-4 rounded-lg ${rule.type === 'knockout' ? 'bg-red-50/50 border-red-100' : 'bg-blue-50/50 border-blue-100'}`}>
                    <div className="flex justify-between mb-4">
                      <Select value={rule.type} onValueChange={v => updateOutcome(rule.id, 'type', v)}>
                        <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="knockout">Knockout Rule</SelectItem>
                          <SelectItem value="threshold">Score Threshold</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => deleteOutcome(rule.id)}><Trash2 className="w-4 h-4"/></Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label>Rule Label</Label>
                        <Input value={rule.label} onChange={e => updateOutcome(rule.id, 'label', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Severity</Label>
                        <Select value={rule.severity} onValueChange={v => updateOutcome(rule.id, 'severity', v)}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pass">Pass (Green)</SelectItem>
                            <SelectItem value="caution">Caution (Yellow)</SelectItem>
                            <SelectItem value="fail">Fail (Red)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {rule.type === 'knockout' && (
                      <div className="space-y-2 mb-4">
                        <Label>Condition (Expression)</Label>
                        <Input value={rule.condition} onChange={e => updateOutcome(rule.id, 'condition', e.target.value)} className="font-mono" placeholder="e.g. age < 18 || risk_score > 80"/>
                      </div>
                    )}

                    {rule.type === 'threshold' && (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="space-y-2">
                          <Label>Metric</Label>
                          <Input value={rule.metric} onChange={e => updateOutcome(rule.id, 'metric', e.target.value)} placeholder="e.g. score or calc_key"/>
                        </div>
                        <div className="space-y-2">
                          <Label>Operator</Label>
                          <Select value={rule.operator} onValueChange={v => updateOutcome(rule.id, 'operator', v)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value=">">&gt;</SelectItem>
                              <SelectItem value=">=">&gt;=</SelectItem>
                              <SelectItem value="<">&lt;</SelectItem>
                              <SelectItem value="<=">&lt;=</SelectItem>
                              <SelectItem value="==">==</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Value</Label>
                          <Input type="number" value={rule.threshold} onChange={e => updateOutcome(rule.id, 'threshold', parseFloat(e.target.value))} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Outcome Message</Label>
                      <Textarea value={rule.message} onChange={e => updateOutcome(rule.id, 'message', e.target.value)} />
                    </div>
                  </div>
                ))}
                <Button onClick={addOutcome} variant="outline"><Plus className="w-4 h-4 mr-2"/> Add Rule</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-4 max-w-2xl">
            <Card>
              <CardHeader><CardTitle>Paywall Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border p-4 rounded">
                  <Label>Gate Results with Stripe</Label>
                  <Switch checked={quiz.gateResults} onCheckedChange={c => updateField('gateResults', c)}/>
                </div>
                {quiz.gateResults && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Price ($)</Label>
                      <Input type="number" value={quiz.price} onChange={e => updateField('price', parseFloat(e.target.value))}/>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
