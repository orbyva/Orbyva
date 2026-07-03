import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface SuggestedQuestionsProps {
  questions: string[];
  disabled?: boolean;
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({
  questions,
  disabled,
  onSelect,
}: SuggestedQuestionsProps) {
  if (questions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        Sugestões
      </p>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {questions.map((question) => (
          <Button
            key={question}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto max-w-full whitespace-normal px-2.5 py-1.5 text-left text-[11px] leading-snug sm:px-3 sm:text-xs"
            disabled={disabled}
            onClick={() => onSelect(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}
