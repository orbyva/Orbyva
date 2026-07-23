import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Share2, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { MoneyInput } from "@/components/MoneyInput";
import { PlaceDetailDialog } from "@/components/PlaceDetailDialog";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { TripFormDialog } from "@/components/TripFormDialog";
import { TripMembersDialog } from "@/components/TripMembersDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ShareImageDialog } from "@/components/ShareImageDialog";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { PageShell } from "@/components/PageShell";
import { generateTripShareImage, shareTripNative } from "@/lib/tripShare";
import {
  createItineraryActivity,
  createTripExpense,
  createTripMilestone,
  deleteTrip,
  fetchTripFull,
  registerMyExpenseSplit,
  updateItineraryActivity,
  updateItineraryDayNotes,
  updateTripExpense,
  updateTripMilestone,
} from "@/api/travel";
import { listTripMembers, ensureTripOwnerMember } from "@/api/tripMembers";
import { deletePlace, enrichPlacesWithOpinions, fetchPlaces } from "@/api/places";
import { useDimensions } from "@/hooks/useDimensions";
import { useAuth } from "@/hooks/useAuth";
import type { TripMember } from "@/types/tripSharing";
import type { TripExpenseVisibility } from "@/types/travel";
import {
  EXPENSE_CATEGORY_LABELS,
  MILESTONE_TYPE_LABELS,
  TRIP_STATUS_LABELS,
} from "@/domain/travel";
import type {
  TripExpense,
  TripExpenseCategory,
  TripFull,
  TripItineraryActivity,
  TripItineraryDay,
  TripMilestone,
  TripMilestoneType,
} from "@/types/travel";
import type { PlaceVisit } from "@/types/places";
import { useToast } from "@/hooks/use-toast";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { getErrorMessage } from "@/lib/errors";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { sortByNamePt } from "@/lib/utils";
import { TripBudgetSummary } from "./components/TripBudgetSummary";
import { TripItineraryTab } from "./components/TripItineraryTab";
import { TripExpensesTab } from "./components/TripExpensesTab";
import { TripPlacesTab } from "./components/TripPlacesTab";
import { TripMilestonesTab } from "./components/TripMilestonesTab";

const emptyExpenseForm = () => ({
  description: "",
  amount: 0,
  category: "food" as TripExpenseCategory,
  expense_date: new Date().toISOString().split("T")[0],
  visibility: "personal" as TripExpenseVisibility,
});

const emptyMilestoneForm = () => ({
  title: "",
  type: "other" as TripMilestoneType,
  due_date: new Date().toISOString().split("T")[0],
  notes: "",
});

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripFull | null>(null);
  const [places, setPlaces] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [registerExpense, setRegisterExpense] = useState(false);
  const [financeTypeId, setFinanceTypeId] = useState(0);
  const [classId, setClassId] = useState(0);
  const [splitRegisterExpense, setSplitRegisterExpense] =
    useState<TripExpense | null>(null);

  const needDimensions = expenseDialogOpen || registerExpense || !!splitRegisterExpense;
  const { dimensions } = useDimensions({ enabled: needDimensions });
  const { toast } = useToast();
  useBreadcrumbTitle(trip?.title);

  const [editTripOpen, setEditTripOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [editingDay, setEditingDay] = useState<TripItineraryDay | null>(null);
  const [dayForm, setDayForm] = useState({ title: "", notes: "" });
  const [editingActivity, setEditingActivity] =
    useState<TripItineraryActivity | null>(null);
  const [activityForm, setActivityForm] = useState({
    title: "",
    activity_time: "",
    notes: "",
  });

  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);

  const [selectedPlace, setSelectedPlace] = useState<PlaceVisit | null>(null);
  const [placeDetailOpen, setPlaceDetailOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<PlaceVisit | null>(null);
  const [placeEditOpen, setPlaceEditOpen] = useState(false);

  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm());
  const [editingMilestone, setEditingMilestone] = useState<TripMilestone | null>(
    null
  );
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [members, setMembers] = useState<TripMember[]>([]);
  const { user } = useAuth();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, p] = await Promise.all([fetchTripFull(id), fetchPlaces(id)]);
      setTrip(t);
      try {
        setPlaces(await enrichPlacesWithOpinions(p));
      } catch {
        setPlaces(p);
      }
      try {
        if (t?.user_id) {
          await ensureTripOwnerMember(id, t.user_id);
        }
        setMembers(await listTripMembers(id));
      } catch {
        setMembers([]);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const expenseNature = dimensions.find((n) => n.name === "Despesa");
  const expenseTypes = sortByNamePt(expenseNature?.types ?? []);
  const selectedExpenseType = expenseTypes.find((t) => t.id === financeTypeId);
  const expenseClasses = sortByNamePt(selectedExpenseType?.classes ?? []);

  if (loading) {
    return (
      <PageShell title="Viagem">
        <TableLoadingSkeleton rows={8} />
      </PageShell>
    );
  }

  if (!trip) {
    return (
      <PageShell title="Viagem">
        <p className="text-center">Viagem não encontrada.</p>
        <div className="text-center">
          <Button variant="link" asChild>
            <Link to="/travel">Voltar</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const isOngoing = trip.status === "ongoing";
  const hasBudget = trip.budget != null && trip.budget > 0;
  const budgetProgress = hasBudget
    ? Math.min(100, (trip.expenseTotal / (trip.budget as number)) * 100)
    : 0;
  const overBudget = hasBudget && (trip.budgetRemaining ?? 0) < 0;

  function openExpenseCreate() {
    setEditingExpense(null);
    setExpenseForm(emptyExpenseForm());
    setRegisterExpense(false);
    setFinanceTypeId(0);
    setClassId(0);
    setExpenseDialogOpen(true);
  }

  function openExpenseEdit(exp: TripExpense) {
    setEditingExpense(exp);
    setExpenseForm({
      description: exp.description,
      amount: exp.amount,
      category: exp.category,
      expense_date: exp.expense_date,
      visibility: exp.visibility ?? "personal",
    });
    setRegisterExpense(false);
    setFinanceTypeId(0);
    setClassId(0);
    setExpenseDialogOpen(true);
  }

  function equalSplits(total: number, memberList: TripMember[]) {
    if (memberList.length === 0) return [];
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / memberList.length);
    let rem = cents - base * memberList.length;
    return memberList.map((m) => {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      return { user_id: m.user_id, amount: (base + extra) / 100 };
    });
  }

  async function handleSaveExpense() {
    if (!expenseForm.description || expenseForm.amount <= 0) return;

    if (!editingExpense && registerExpense && (!financeTypeId || !classId)) {
      toast({
        title: "Selecione tipo e classe",
        description:
          "Para registrar em Finanças, escolha o tipo e a classe da despesa.",
        variant: "destructive",
      });
      return;
    }

    const visibility = expenseForm.visibility ?? "personal";
    const splits =
      visibility === "shared"
        ? equalSplits(expenseForm.amount, members.length ? members : [])
        : undefined;

    if (visibility === "shared" && (!splits || splits.length === 0)) {
      toast({
        title: "Sem membros",
        description:
          "Convide alguém ou rode o script de viagem compartilhada para dividir gastos.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingExpense) {
        await updateTripExpense({
          id: editingExpense.id,
          trip_id: trip!.id,
          ...expenseForm,
          splits,
        });
        toast({ title: "Gasto atualizado!", duration: 2000 });
      } else {
        const transaction =
          registerExpense && classId > 0
            ? {
                class_id: classId,
                value:
                  visibility === "shared"
                    ? splits?.find((s) => s.user_id === user?.id)?.amount ??
                      expenseForm.amount
                    : expenseForm.amount,
                description: `Viagem ${trip!.title}: ${expenseForm.description}`,
                transaction_at: new Date(
                  `${expenseForm.expense_date}T12:00:00`
                ).toISOString(),
              }
            : null;

        await createTripExpense(
          { ...expenseForm, trip_id: trip!.id, splits },
          transaction
        );
        toast({ title: "Gasto registrado!", duration: 2000 });
      }
      setExpenseDialogOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  function openMilestoneCreate() {
    setEditingMilestone(null);
    setMilestoneForm(emptyMilestoneForm());
    setMilestoneDialogOpen(true);
  }

  function openMilestoneEdit(m: TripMilestone) {
    setEditingMilestone(m);
    setMilestoneForm({
      title: m.title,
      type: m.type,
      due_date: m.due_date,
      notes: m.notes ?? "",
    });
    setMilestoneDialogOpen(true);
  }

  async function handleSaveMilestone() {
    if (!milestoneForm.title.trim()) return;
    try {
      if (editingMilestone) {
        await updateTripMilestone({
          id: editingMilestone.id,
          title: milestoneForm.title.trim(),
          type: milestoneForm.type,
          due_date: milestoneForm.due_date,
          notes: milestoneForm.notes.trim() || null,
        });
        toast({ title: "Prazo atualizado!", duration: 2000 });
      } else {
        await createTripMilestone({
          trip_id: trip!.id,
          title: milestoneForm.title.trim(),
          type: milestoneForm.type,
          due_date: milestoneForm.due_date,
          notes: milestoneForm.notes.trim() || null,
          done: false,
        });
        toast({ title: "Prazo adicionado!", duration: 2000 });
      }
      setMilestoneDialogOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleAddActivity(dayId: string, title: string) {
    if (!title.trim()) return;
    try {
      const day = trip!.itinerary.find((d) => d.id === dayId);
      await createItineraryActivity({
        day_id: dayId,
        title,
        sort_order: (day?.activities?.length ?? 0) + 1,
      });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  function openDayEdit(day: TripItineraryDay) {
    setEditingDay(day);
    setDayForm({
      title: day.title ?? `Dia ${day.day_number}`,
      notes: day.notes ?? "",
    });
  }

  async function handleSaveDay() {
    if (!editingDay) return;
    try {
      await updateItineraryDayNotes(
        editingDay.id,
        dayForm.notes.trim() || null,
        dayForm.title.trim() || null
      );
      toast({ title: "Dia atualizado!", duration: 2000 });
      setEditingDay(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  function openActivityEdit(act: TripItineraryActivity) {
    setEditingActivity(act);
    setActivityForm({
      title: act.title,
      activity_time: act.activity_time ?? "",
      notes: act.notes ?? "",
    });
  }

  async function handleSaveActivity() {
    if (!editingActivity || !activityForm.title.trim()) return;
    try {
      await updateItineraryActivity({
        id: editingActivity.id,
        title: activityForm.title.trim(),
        activity_time: activityForm.activity_time.trim() || null,
        notes: activityForm.notes.trim() || null,
      });
      toast({ title: "Atividade atualizada!", duration: 2000 });
      setEditingActivity(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleDeleteTrip() {
    try {
      await deleteTrip(trip!.id);
      toast({ title: "Viagem excluída", duration: 2000 });
      navigate("/travel");
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleDeletePlace(placeId: string) {
    try {
      await deletePlace(placeId);
      toast({ title: "Lugar excluído", duration: 2000 });
      setPlaceDetailOpen(false);
      setSelectedPlace(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title={trip.title}
      description={trip.destination ?? undefined}
      actions={
        <>
          <Button variant="ghost" size="icon" asChild>
            <Link to="/travel">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status]}</Badge>
          {trip.isShared ? (
            <Badge variant="secondary">Compartilhada</Badge>
          ) : null}
          {isOngoing && (
            <Badge className="bg-success text-success-foreground">
              Em viagem agora
            </Badge>
          )}
          {trip.daysUntilStart != null && trip.daysUntilStart >= 0 && (
            <div className="text-center shrink-0 px-1">
              <p className="text-3xl font-bold text-primary leading-none">
                {trip.daysUntilStart}
              </p>
              <p className="text-[10px] text-muted-foreground">dias</p>
            </div>
          )}
          <TripMembersDialog
            tripId={trip.id}
            myRole={trip.myRole}
            isShared={trip.isShared}
            onChanged={load}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShareOpen(true)}
            aria-label="Compartilhar viagem"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_EDIT_BUTTON_CLASS}
            onClick={() => setEditTripOpen(true)}
            aria-label="Editar viagem"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {trip.myRole === "owner" || !trip.myRole ? (
            <ConfirmDeleteDialog
              title="Excluir esta viagem?"
              description="Roteiro, gastos e lugares vinculados serão removidos."
              onConfirm={handleDeleteTrip}
            >
              <Button variant="ghost" size="icon" className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </ConfirmDeleteDialog>
          ) : null}
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {formatDateBR(trip.start_date)} → {formatDateBR(trip.end_date)}
      </p>
      {trip.notes && (
        <p className="text-sm text-muted-foreground">{trip.notes}</p>
      )}

      <TripBudgetSummary
        trip={trip}
        hasBudget={hasBudget}
        budgetProgress={budgetProgress}
        overBudget={overBudget}
      />

      <Tabs defaultValue="itinerary">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="itinerary">Roteiro</TabsTrigger>
          <TabsTrigger value="expenses">
            Gastos ({trip.expenses.length})
          </TabsTrigger>
          <TabsTrigger value="places">Lugares ({places.length})</TabsTrigger>
          <TabsTrigger value="milestones">
            Prazos ({trip.milestones.length})
          </TabsTrigger>
        </TabsList>

        <TripItineraryTab
          itinerary={trip.itinerary}
          members={members}
          user={user}
          onEditDay={openDayEdit}
          onEditActivity={openActivityEdit}
          onAddActivity={handleAddActivity}
          onReload={load}
        />

        <TripExpensesTab
          trip={trip}
          hasBudget={hasBudget}
          user={user}
          onCreate={openExpenseCreate}
          onEdit={openExpenseEdit}
          onRegisterSplit={(exp) => {
            setSplitRegisterExpense(exp);
            setFinanceTypeId(0);
            setClassId(0);
          }}
          onReload={load}
        />

        <TripPlacesTab
          tripId={trip.id}
          places={places}
          onReload={load}
          onSelectPlace={(p) => {
            setSelectedPlace(p);
            setPlaceDetailOpen(true);
          }}
        />

        <TripMilestonesTab
          milestones={trip.milestones}
          onCreate={openMilestoneCreate}
          onEdit={openMilestoneEdit}
          onReload={load}
        />
      </Tabs>

      {/* Edit trip */}
      <ShareImageDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Compartilhar viagem"
        allowPhoto
        maxPhotos={4}
        generateImage={async (options) =>
          trip
            ? generateTripShareImage(trip, {
                photos: options?.photos?.length
                  ? options.photos
                  : options?.photo
                    ? [options.photo]
                    : [],
                backdropPhoto: options?.backdropPhoto ?? null,
                places,
              })
            : null
        }
        share={async (blob) =>
          trip ? shareTripNative(trip, blob, places) : "cancelled"
        }
      />

      <TripFormDialog
        trip={trip}
        open={editTripOpen}
        onOpenChange={setEditTripOpen}
        onSaved={load}
      />

      {/* Edit day */}
      <Dialog
        open={!!editingDay}
        onOpenChange={(open) => !open && setEditingDay(null)}
      >
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>Editar dia do roteiro</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel>Título</FormLabel>
              <Input
                value={dayForm.title}
                onChange={(e) =>
                  setDayForm({ ...dayForm, title: e.target.value })
                }
              />
            </div>
            <div>
              <FormLabel optional>Notas</FormLabel>
              <Input
                value={dayForm.notes}
                onChange={(e) =>
                  setDayForm({ ...dayForm, notes: e.target.value })
                }
                placeholder="Observações do dia"
              />
            </div>
            <Button onClick={handleSaveDay} className="w-full">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit activity */}
      <Dialog
        open={!!editingActivity}
        onOpenChange={(open) => !open && setEditingActivity(null)}
      >
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>Editar atividade</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Título</FormLabel>
              <Input
                value={activityForm.title}
                onChange={(e) =>
                  setActivityForm({ ...activityForm, title: e.target.value })
                }
              />
            </div>
            <div>
              <FormLabel optional>Horário</FormLabel>
              <Input
                value={activityForm.activity_time}
                onChange={(e) =>
                  setActivityForm({
                    ...activityForm,
                    activity_time: e.target.value,
                  })
                }
                placeholder="Ex: 09:30"
              />
            </div>
            <div>
              <FormLabel optional>Notas</FormLabel>
              <Input
                value={activityForm.notes}
                onChange={(e) =>
                  setActivityForm({ ...activityForm, notes: e.target.value })
                }
              />
            </div>
            <Button onClick={handleSaveActivity} className="w-full">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create / edit expense */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? "Editar gasto" : "Adicionar gasto"}
            </DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Descrição</FormLabel>
              <Input
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm({
                    ...expenseForm,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <FormLabel required>Valor</FormLabel>
              <MoneyInput
                value={expenseForm.amount || ""}
                onChange={(value) =>
                  setExpenseForm({
                    ...expenseForm,
                    amount: value === "" ? 0 : value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel>Categoria</FormLabel>
                <Select
                  value={expenseForm.category}
                  onValueChange={(v) =>
                    setExpenseForm({
                      ...expenseForm,
                      category: v as TripExpenseCategory,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FormLabel>Data</FormLabel>
                <DatePicker
                  date={new Date(`${expenseForm.expense_date}T12:00:00`)}
                  onSelect={(d) =>
                    setExpenseForm({
                      ...expenseForm,
                      expense_date: d
                        ? d.toISOString().split("T")[0]
                        : expenseForm.expense_date,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <FormLabel>Tipo do gasto</FormLabel>
              <Select
                value={expenseForm.visibility}
                onValueChange={(v) =>
                  setExpenseForm({
                    ...expenseForm,
                    visibility: v as TripExpenseVisibility,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Pessoal (só você vê)</SelectItem>
                  <SelectItem value="shared">
                    Conjunta (divide entre membros)
                  </SelectItem>
                </SelectContent>
              </Select>
              {expenseForm.visibility === "shared" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Divide igual entre {Math.max(members.length, 1)} membro(s).
                  Ex.: casa alugada.
                </p>
              ) : null}
            </div>
            {!editingExpense && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={registerExpense}
                    onChange={(e) => {
                      setRegisterExpense(e.target.checked);
                      if (!e.target.checked) {
                        setFinanceTypeId(0);
                        setClassId(0);
                      }
                    }}
                    className="rounded"
                  />
                  Registrar em Finanças
                </label>
                {registerExpense && (
                  <div
                    className={
                      financeTypeId
                        ? "grid grid-cols-2 gap-3"
                        : "grid grid-cols-1 gap-3"
                    }
                  >
                    <div>
                      <FormLabel required>Tipo</FormLabel>
                      <Select
                        value={financeTypeId ? String(financeTypeId) : ""}
                        onValueChange={(v) => {
                          setFinanceTypeId(Number(v));
                          setClassId(0);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseTypes.map((type) => (
                            <SelectItem key={type.id} value={String(type.id)}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {financeTypeId ? (
                      <div>
                        <FormLabel required>Classe</FormLabel>
                        <Select
                          value={classId ? String(classId) : ""}
                          onValueChange={(v) => setClassId(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a classe" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseClasses.map((cls) => (
                              <SelectItem key={cls.id} value={String(cls.id)}>
                                {cls.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            )}
            <Button onClick={handleSaveExpense} className="w-full">
              {editingExpense ? "Salvar alterações" : "Adicionar gasto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!splitRegisterExpense}
        onOpenChange={(open) => !open && setSplitRegisterExpense(null)}
      >
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>Registrar Despesa</DialogTitle>
          </DialogHeader>
          {splitRegisterExpense ? (
            <div className={FORM_FIELDS_CLASS}>
              <p className="text-sm text-muted-foreground">
                {splitRegisterExpense.description} — sua fatia{" "}
                {formatBRL(
                  splitRegisterExpense.splits?.find(
                    (s) => s.user_id === user?.id
                  )?.amount ?? 0
                )}
              </p>
              <div
                className={
                  financeTypeId
                    ? "grid grid-cols-2 gap-3"
                    : "grid grid-cols-1 gap-3"
                }
              >
                <div>
                  <FormLabel required>Tipo</FormLabel>
                  <Select
                    value={financeTypeId ? String(financeTypeId) : ""}
                    onValueChange={(v) => {
                      setFinanceTypeId(Number(v));
                      setClassId(0);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseTypes.map((type) => (
                        <SelectItem key={type.id} value={String(type.id)}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {financeTypeId ? (
                  <div>
                    <FormLabel required>Classe</FormLabel>
                    <Select
                      value={classId ? String(classId) : ""}
                      onValueChange={(v) => setClassId(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Classe" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseClasses.map((cls) => (
                          <SelectItem key={cls.id} value={String(cls.id)}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <Button
                className="w-full"
                disabled={!classId}
                onClick={() =>
                  void (async () => {
                    try {
                      await registerMyExpenseSplit(splitRegisterExpense.id, {
                        class_id: classId,
                        value: 0,
                        description: `Viagem ${trip.title}: ${splitRegisterExpense.description}`,
                        transaction_at: new Date(
                          `${splitRegisterExpense.expense_date}T12:00:00`
                        ).toISOString(),
                      });
                      toast({ title: "Fatia registrada no extrato" });
                      setSplitRegisterExpense(null);
                      load();
                    } catch (error) {
                      toast({
                        title: "Erro",
                        description: getErrorMessage(error),
                        variant: "destructive",
                      });
                    }
                  })()
                }
              >
                Confirmar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Create / edit milestone */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>
              {editingMilestone ? "Editar prazo" : "Adicionar prazo"}
            </DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Título</FormLabel>
              <Input
                value={milestoneForm.title}
                onChange={(e) =>
                  setMilestoneForm({
                    ...milestoneForm,
                    title: e.target.value,
                  })
                }
                placeholder="Ex: Check-in voo, Reserva hotel..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel>Tipo</FormLabel>
                <Select
                  value={milestoneForm.type}
                  onValueChange={(v) =>
                    setMilestoneForm({
                      ...milestoneForm,
                      type: v as TripMilestoneType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MILESTONE_TYPE_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FormLabel>Data limite</FormLabel>
                <DatePicker
                  date={new Date(`${milestoneForm.due_date}T12:00:00`)}
                  onSelect={(d) =>
                    setMilestoneForm({
                      ...milestoneForm,
                      due_date: d
                        ? d.toISOString().split("T")[0]
                        : milestoneForm.due_date,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <FormLabel optional>Notas</FormLabel>
              <Input
                value={milestoneForm.notes}
                onChange={(e) =>
                  setMilestoneForm({
                    ...milestoneForm,
                    notes: e.target.value,
                  })
                }
              />
            </div>
            <Button onClick={handleSaveMilestone} className="w-full">
              {editingMilestone ? "Salvar alterações" : "Adicionar prazo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Place detail + edit */}
      <PlaceDetailDialog
        place={selectedPlace}
        open={placeDetailOpen}
        onOpenChange={setPlaceDetailOpen}
        onOpinionSaved={load}
        isSharedTrip={Boolean(trip.isShared)}
        onEdit={() => {
          if (!selectedPlace) return;
          setEditingPlace(selectedPlace);
          setPlaceDetailOpen(false);
          setPlaceEditOpen(true);
        }}
        onDelete={() => {
          if (selectedPlace) handleDeletePlace(selectedPlace.id);
        }}
      />
      <PlaceFormDialog
        place={editingPlace}
        tripId={trip.id}
        open={placeEditOpen}
        onOpenChange={(open) => {
          setPlaceEditOpen(open);
          if (!open) setEditingPlace(null);
        }}
        onSaved={load}
      />
    </PageShell>
  );
}
