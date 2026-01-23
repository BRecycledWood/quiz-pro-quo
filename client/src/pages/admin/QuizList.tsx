import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MOCK_QUIZZES } from "@/lib/mock-data";
import { Link } from "wouter";
import { Plus, MoreHorizontal, Edit2, PlayCircle, Copy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function QuizList() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Quizzes</h1>
          <p className="text-muted-foreground">Manage your organization's quizzes and assessments.</p>
        </div>
        <Link href="/admin/quizzes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Create New Quiz
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {MOCK_QUIZZES.map((quiz) => (
          <Card key={quiz.id} className="group hover:shadow-lg transition-all duration-300">
            <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted relative">
              {quiz.image ? (
                <img src={quiz.image} alt={quiz.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/5 text-primary">
                  <span className="font-display font-bold text-2xl opacity-20">No Image</span>
                </div>
              )}
              <div className="absolute top-2 right-2">
                 <Badge variant={quiz.published ? "default" : "secondary"}>
                   {quiz.published ? "Published" : "Draft"}
                 </Badge>
              </div>
            </div>
            <CardHeader>
              <CardTitle className="line-clamp-1">{quiz.title}</CardTitle>
              <CardDescription className="line-clamp-2 min-h-[40px]">
                {quiz.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                <span>{quiz.questions.length} Questions</span>
                <span>{quiz.gateResults ? `$${quiz.price}` : 'Free'}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Link href={`/admin/quizzes/${quiz.id}`}>
                  <Button variant="outline" className="flex-1">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <Link href={`/quiz/${quiz.slug}`}>
                      <DropdownMenuItem>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Test Quiz
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
