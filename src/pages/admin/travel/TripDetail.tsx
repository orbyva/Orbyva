import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  MapPin,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel } from "@/components/FormLabel";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createItineraryActivity,
  createTripExpense,
  createTripMilestone,
  deleteItineraryActivity,
  deleteTrip,
  deleteTripExpense,
  deleteTripMilestone,
  fetchTripFull,
  updateTripMilestone,
} from "@/api/travel";
import { fetchPlaces } from "@/api/places";
import { useDimensions } from "@/hooks/useDimensions";
import {
  EXPENSE_CATEGORY_LABELS,
  TRIP_STATUS_LABELS,
} from "@/domain/travel";
import type { TripFull, TripExpenseCategory } from "@/types/travel";
import type { PlaceVisit } from "@/types/places";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripFull | null>(null);
  const [places, setPlaces] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const { dimensions } = useDimensions();
  const { toast } = useToast();

  const [newActivity, setNewActivity] = useState<Record<string, string>>({});
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: 0,
    category: "food" as TripExpenseCategory,
    expense_date: new Date().toISOString().split("T")[0],
  });
  const [registerExpense, setRegisterExpense] = useState(false);
  const [financeTypeId, setFinanceTypeId] = useState(0);
  const [classId, setClassId] = useState(0);
  const [milestoneForm, setMilestoneForm] = useState({
    title: "",
    type: "other" as const,
    due_date: new Date().toISOString().split("T")[0],
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, p] = await Promise.all([
        fetchTripFull(id),
        fetchPlaces(id),
      ]);
      setTrip(t);
      setPlaces(p);
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const expenseNature = dimensions.find((n) => n.name === "Despesa");
  const expenseTypes = expenseNature?.types ?? [];
  const selectedExpenseType = expenseTypes.find((t) => t.id === financeTypeId);
  const expenseClasses = selectedExpenseType?.classes ?? [];

  if (loading) {
    return (
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <TableLoadingSkeleton rows={8} />
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="p-6 text-center">
        <p>Viagem não encontrada.</p>
        <Button variant="link" asChild><Link to="/travel">Voltar</Link></Button>
      </main>
    );
  }

  const isOngoing = trip.status === "ongoing";

  async function handleAddExpense() {
    if (!expenseForm.description || expenseForm.amount <= 0) return;
    if (registerExpense && (!financeTypeId || !classId)) {
      toast({
        title: "Selecione tipo e classe",
        description: "Para registrar em Finanças, escolha o tipo e a classe da despesa.",
        variant: "destructive",
      });
      return;
    }
    try {
      const transaction =
        registerExpense && classId > 0
          ? {
              class_id: classId,
              value: expenseForm.amount,
              description: `Viagem ${trip!.title}: ${expenseForm.description}`,
              transaction_at: new Date(`${expenseForm.expense_date}T12:00:00`).toISOString(),
            }
          : null;

      await createTripExpense(
        { ...expenseForm, trip_id: trip!.id },
        transaction
      );
      toast({ title: "Gasto registrado!", duration: 2000 });
      setExpenseForm({ ...expenseForm, description: "", amount: 0 });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleAddMilestone() {
    if (!milestoneForm.title.trim()) return;
    try {
      await createTripMilestone({ ...milestoneForm, trip_id: trip!.id, done: false });
      setMilestoneForm({ ...milestoneForm, title: "" });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleAddActivity(dayId: string) {
    const title = newActivity[dayId];
    if (!title?.trim()) return;
    try {
      const day = trip!.itinerary.find((d) => d.id === dayId);
      await createItineraryActivity({
        day_id: dayId,
        title,
        sort_order: (day?.activities?.length ?? 0) + 1,
      });
      setNewActivity({ ...newActivity, [dayId]: "" });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleDeleteTrip() {
    try {
      await deleteTrip(trip!.id);
      toast({ title: "Viagem excluída", duration: 2000 });
      navigate("/travel");
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/travel"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{trip.title}</h1>
            <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status]}</Badge>
            {isOngoing && (
              <Badge className="bg-success text-success-foreground">Em viagem agora</Badge>
            )}
          </div>
          {trip.destination && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />{trip.destination}
            </p>
          )}
        </div>
        {trip.daysUntilStart != null && trip.daysUntilStart >= 0 && (
          <div className="text-center shrink-0">
            <p className="text-3xl font-bold text-primary">{trip.daysUntilStart}</p>
            <p className="text-[10px] text-muted-foreground">dias</p>
          </div>
        )}
        <ConfirmDeleteDialog
          title="Excluir esta viagem?"
          description="Roteiro, gastos e lugares vinculados serão removidos."
          onConfirm={handleDeleteTrip}
        >
          <Button variant="ghost" size="icon" className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </ConfirmDeleteDialog>
      </div>

      <p className="text-sm text-muted-foreground">
        {formatDateBR(trip.start_date)} → {formatDateBR(trip.end_date)}
      </p>

      {/* Budget summary */}
      {trip.budget != null && (
        <section className="rounded-lg border bg-card p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Orçamento</p>
            <p className="font-bold">{formatBRL(trip.budget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gasto</p>
            <p className="font-bold text-destructive">{formatBRL(trip.expenseTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Restante</p>
            <p className={cn("font-bold", (trip.budgetRemaining ?? 0) < 0 ? "text-destructive" : "text-success")}>
              {trip.budgetRemaining != null ? formatBRL(trip.budgetRemaining) : "—"}
            </p>
          </div>
        </section>
      )}

      <Tabs defaultValue="itinerary">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="itinerary">Roteiro</TabsTrigger>
          <TabsTrigger value="expenses">Gastos</TabsTrigger>
          <TabsTrigger value="places">Lugares ({places.length})</TabsTrigger>
          <TabsTrigger value="milestones">Prazos</TabsTrigger>
        </TabsList>

        {/* Itinerary */}
        <TabsContent value="itinerary" className="mt-4 space-y-4">
          {trip.itinerary.map((day) => (
            <article key={day.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">
                  {day.title ?? `Dia ${day.day_number}`}
                  {day.date && <span className="ml-2 text-sm font-normal text-muted-foreground">{formatDateBR(day.date)}</span>}
                </h3>
              </div>
              <ul className="space-y-1.5 mb-2">
                {(day.activities ?? []).map((act) => (
                  <li key={act.id} className="flex items-center gap-2 text-sm">
                    {act.activity_time && <span className="text-xs text-muted-foreground w-12">{act.activity_time}</span>}
                    <span className="flex-1">{act.title}</span>
                    <ConfirmDeleteDialog
                      title="Excluir esta atividade?"
                      onConfirm={() => deleteItineraryActivity(act.id).then(load)}
                    >
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </ConfirmDeleteDialog>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar atividade..."
                  value={newActivity[day.id] ?? ""}
                  onChange={(e) => setNewActivity({ ...newActivity, [day.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleAddActivity(day.id)}
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={() => handleAddActivity(day.id)}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </article>
          ))}
        </TabsContent>

        {/* Expenses */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><FormLabel required>Descrição</FormLabel><Input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></div>
              <div><FormLabel required>Valor</FormLabel><Input type="number" value={expenseForm.amount || ""} onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel>Categoria</FormLabel>
                <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v as TripExpenseCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><FormLabel>Data</FormLabel><DatePicker date={new Date(`${expenseForm.expense_date}T12:00:00`)} onSelect={(d) => setExpenseForm({ ...expenseForm, expense_date: d ? d.toISOString().split("T")[0] : expenseForm.expense_date })} /></div>
            </div>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div>
                  <FormLabel required>Classe</FormLabel>
                  <Select
                    value={classId ? String(classId) : ""}
                    onValueChange={(v) => setClassId(Number(v))}
                    disabled={!financeTypeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={financeTypeId ? "Selecione a classe" : "Escolha o tipo primeiro"} />
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
              </div>
            )}
            <Button onClick={handleAddExpense} className="w-full">Adicionar gasto</Button>
          </div>
          <ul className="space-y-2">
            {trip.expenses.map((exp) => (
              <li key={exp.id} className="flex justify-between items-center rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{exp.description}</p>
                  <p className="text-xs text-muted-foreground">{EXPENSE_CATEGORY_LABELS[exp.category]} · {formatDateBR(exp.expense_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatBRL(exp.amount)}</span>
                  <ConfirmDeleteDialog
                    title="Excluir este gasto?"
                    onConfirm={() => deleteTripExpense(exp.id, trip.id).then(load)}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </ConfirmDeleteDialog>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>

        {/* Places */}
        <TabsContent value="places" className="mt-4 space-y-4">
          <PlaceFormDialog tripId={trip.id} onSaved={load} trigger={<Button><Plus className="mr-2 h-4 w-4" />Avaliar lugar visitado</Button>} />
          {places.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum lugar avaliado nesta viagem ainda. Registre restaurantes, passeios e mais!
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {places.map((p) => <PlaceCard key={p.id} place={p} />)}
            </div>
          )}
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Ex: Check-in voo, Reserva hotel..." value={milestoneForm.title} onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })} className="flex-1" />
            <DatePicker date={new Date(`${milestoneForm.due_date}T12:00:00`)} onSelect={(d) => setMilestoneForm({ ...milestoneForm, due_date: d ? d.toISOString().split("T")[0] : milestoneForm.due_date })} />
            <Button onClick={handleAddMilestone}><Plus className="h-4 w-4" /></Button>
          </div>
          <ul className="space-y-2">
            {trip.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                <button type="button" onClick={() => updateTripMilestone({ id: m.id, done: !m.done }).then(load)} className={cn("flex h-5 w-5 items-center justify-center rounded border", m.done ? "bg-success border-success text-success-foreground" : "border-muted-foreground/30")}>
                  {m.done && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1">
                  <p className={cn("text-sm font-medium", m.done && "line-through text-muted-foreground")}>{m.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(m.due_date)}</p>
                </div>
                <ConfirmDeleteDialog
                  title="Excluir este prazo?"
                  onConfirm={() => deleteTripMilestone(m.id).then(load)}
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDeleteDialog>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </main>
  );
}
