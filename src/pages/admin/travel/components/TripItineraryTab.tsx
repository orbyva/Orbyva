import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { deleteItineraryActivity } from "@/api/travel";
import {
  normalizeAvatarUrl,
  avatarFromUserMeta,
  googleAvatarColor,
  googleAvatarInitial,
} from "@/lib/avatar";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { TripMember } from "@/types/tripSharing";
import type {
  TripItineraryActivity,
  TripItineraryDay,
} from "@/types/travel";

function ActivityQuickAdd({
  onAdd,
}: {
  onAdd: (title: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");

  async function submit() {
    const title = value.trim();
    if (!title) return;
    await onAdd(title);
    setValue("");
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Adicionar atividade..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        className="h-10"
      />
      <Button size="sm" onClick={() => void submit()}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type TripItineraryTabProps = {
  itinerary: TripItineraryDay[];
  members: TripMember[];
  user: User | null;
  onEditDay: (day: TripItineraryDay) => void;
  onEditActivity: (act: TripItineraryActivity) => void;
  onAddActivity: (dayId: string, title: string) => void | Promise<void>;
  onReload: () => void;
};

export function TripItineraryTab({
  itinerary,
  members,
  user,
  onEditDay,
  onEditActivity,
  onAddActivity,
  onReload,
}: TripItineraryTabProps) {
  return (
    <TabsContent value="itinerary" className="mt-4 space-y-4">
      {itinerary.map((day) => (
        <article key={day.id} className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-semibold">
              {day.title ?? `Dia ${day.day_number}`}
              {day.date && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {formatDateBR(day.date)}
                </span>
              )}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7 shrink-0", ICON_EDIT_BUTTON_CLASS)}
              onClick={() => onEditDay(day)}
              aria-label="Editar dia"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          {day.notes && (
            <p className="text-xs text-muted-foreground mb-2">{day.notes}</p>
          )}
          <ul className="space-y-1.5 mb-2">
            {(day.activities ?? []).map((act) => {
              const member = members.find(
                (m) => m.user_id === act.created_by_user_id
              );
              const isMine =
                !!user?.id &&
                (act.created_by_user_id === user.id ||
                  (!act.created_by_user_id && members.length <= 1));
              const myName =
                (user?.user_metadata?.full_name as string | undefined) ||
                (user?.user_metadata?.name as string | undefined) ||
                user?.email?.split("@")[0] ||
                null;
              const myAvatar = avatarFromUserMeta(
                user?.user_metadata as Record<string, unknown> | undefined
              );
              const authorName =
                act.created_by_name ||
                member?.display_name ||
                (isMine ? myName : null);
              const authorAvatar =
                (isMine ? myAvatar : undefined) ||
                normalizeAvatarUrl(act.created_by_avatar) ||
                normalizeAvatarUrl(member?.avatar_url) ||
                (isMine ? myAvatar : undefined);
              const initial = googleAvatarInitial(authorName);
              const fallbackColor = googleAvatarColor(
                act.created_by_user_id || authorName || user?.id || "user"
              );
              const showAuthor =
                !!act.created_by_user_id ||
                !!authorName ||
                !!authorAvatar ||
                isMine;

              return (
                <li
                  key={act.id}
                  className="flex items-center gap-2 text-sm"
                >
                  {act.activity_time && (
                    <span className="text-xs text-muted-foreground w-12 shrink-0">
                      {act.activity_time}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <span>{act.title}</span>
                    {act.notes && (
                      <p className="text-xs text-muted-foreground truncate">
                        {act.notes}
                      </p>
                    )}
                  </div>
                  {showAuthor ? (
                    <Avatar
                      className="h-6 w-6 shrink-0"
                      title={
                        authorName
                          ? `Adicionado por ${authorName}`
                          : "Quem adicionou"
                      }
                    >
                      {authorAvatar ? (
                        <AvatarImage
                          src={authorAvatar}
                          alt={authorName ?? ""}
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <AvatarFallback
                        className="text-[11px] font-medium text-white"
                        style={{ backgroundColor: fallbackColor }}
                      >
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-6 w-6 shrink-0",
                      ICON_EDIT_BUTTON_CLASS
                    )}
                    onClick={() => onEditActivity(act)}
                    aria-label="Editar atividade"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <ConfirmDeleteDialog
                    title="Excluir esta atividade?"
                    onConfirm={() =>
                      deleteItineraryActivity(act.id).then(onReload)
                    }
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </ConfirmDeleteDialog>
                </li>
              );
            })}
          </ul>
          <ActivityQuickAdd
            onAdd={(title) => onAddActivity(day.id, title)}
          />
        </article>
      ))}
    </TabsContent>
  );
}
