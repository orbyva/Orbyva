import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createChecklistItem,
  createItineraryActivity,
  createTripExpense,
  createTripMilestone,
  deleteChecklistItem,
  deleteItineraryActivity,
  deleteTrip,
  deleteTripExpense,
  deleteTripMilestone,
  fetchTripFull,
  updateChecklistItem,
  updateTripMilestone,
} from "@/api/travel";
import { fetchPlaces } from "@/api/places";
import { useDimensions } from "@/hooks/useDimensions";
import {
  CHECKLIST_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  groupChecklistByCategory,
  TRIP_STATUS_LABELS,
} from "@/domain/travel";
import type { TripFull, TripChecklistCategory, TripExpenseCategory } from "@/types/travel";
import type { PlaceVisit } from "@/types/places";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripFull | null>(null);
  const [places, setPlaces] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const { dimensions } = useDimensions();
  const { toast } = useToast();

  const [newChecklist, setNewChecklist] = useState("");
  const [checklistCategory, setChecklistCategory] = useState<TripChecklistCategory>("other");
  const [newActivity, setNewActivity] = useState<Record<string, string>>({});
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: 0,
    category: "food" as TripExpenseCategory,
    expense_date: new Date().toISOString().split("T")[0],
  });
  const [registerExpense, setRegisterExpense] = useState(false);
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

  const expenseClasses = dimensions
    .find((n) => n.name === "Despesa")
    ?.types.flatMap((t) => t.classes.map((c) => ({ ...c, typeName: t.name }))) ?? [];

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

  const checklistGroups = groupChecklistByCategory(trip.checklist);
  const isOngoing = trip.status === "ongoing";

  async function handleAddChecklist() {
    if (!newChecklist.trim()) return;
    try {
      await createChecklistItem({
        trip_id: trip!.id,
        title: newChecklist,
        category: checklistCategory,
        done: false,
        sort_order: trip!.checklist.length + 1,
      });
      setNewChecklist("");
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleAddExpense() {
    if (!expenseForm.description || expenseForm.amount <= 0) return;
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
        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
          await deleteTrip(trip.id);
          window.location.href = "/travel";
        }}>
          <Trash2 className="h-4 w-4" />
        </Button>
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

      <Tabs defaultValue="checklist">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="itinerary">Roteiro</TabsTrigger>
          <TabsTrigger value="expenses">Gastos</TabsTrigger>
          <TabsTrigger value="places">Lugares ({places.length})</TabsTrigger>
          <TabsTrigger value="milestones">Prazos</TabsTrigger>
        </TabsList>

        {/* Checklist */}
        <TabsContent value="checklist" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Novo item..."
              value={newChecklist}
              onChange={(e) => setNewChecklist(e.target.value)}
              className="flex-1 min-w-[200px]"
              onKeyDown={(e) => e.key === "Enter" && handleAddChecklist()}
            />
            <Select value={checklistCategory} onValueChange={(v) => setChecklistCategory(v as TripChecklistCategory)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CHECKLIST_CATEGORY_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddChecklist}><Plus className="h-4 w-4" /></Button>
          </div>
          {Object.entries(checklistGroups).map(([cat, items]) =>
            items.length > 0 ? (
              <div key={cat}>
                <h3 className="text-sm font-semibold mb-2">{CHECKLIST_CATEGORY_LABELS[cat as TripChecklistCategory]}</h3>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateChecklistItem({ id: item.id, done: !item.done }).then(load)}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border shrink-0",
                          item.done ? "bg-success border-success text-success-foreground" : "border-muted-foreground/30"
                        )}
                      >
                        {item.done && <Check className="h-3 w-3" />}
                      </button>
                      <span className={cn("text-sm flex-1", item.done && "line-through text-muted-foreground")}>{item.title}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteChecklistItem(item.id).then(load)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </TabsContent>

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
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteItineraryActivity(act.id).then(load)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
              <input type="checkbox" checked={registerExpense} onChange={(e) => setRegisterExpense(e.target.checked)} className="rounded" />
              Registrar em Finanças
            </label>
            {registerExpense && (
              <Select value={classId ? String(classId) : ""} onValueChange={(v) => setClassId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {expenseClasses.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.typeName} · {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTripExpense(exp.id, trip.id).then(load)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTripMilestone(m.id).then(load)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </main>
  );
}
