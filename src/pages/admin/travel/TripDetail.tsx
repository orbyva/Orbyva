import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Share2, Shirt, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { PlaceDetailDialog } from "@/components/PlaceDetailDialog";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { TripFormDialog } from "@/components/TripFormDialog";
import { TripWeatherPackingPanel } from "@/components/TripWeatherPanels";
import { TripWeatherProvider } from "@/components/TripWeatherContext";
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
  fetchTripDetailBundle,
  registerMyExpenseSplit,
  replaceTripStops,
  updateItineraryActivity,
  updateItineraryDayNotes,
  updateTrip,
  updateTripExpense,
  updateTripMilestone,
} from "@/api/travel";
import { ensureTripOwnerMember } from "@/api/tripMembers";
import { createPlace, deletePlace, enrichPlacesWithOpinions, fetchUnlinkedToVisitPlaces, updatePlace } from "@/api/places";
import { fetchTransactionClassMeta } from "@/api/finance";
import { useDimensions } from "@/hooks/useDimensions";
import { useAuth } from "@/hooks/useAuth";
import type { TripMember } from "@/types/tripSharing";
import type { TripExpenseVisibility } from "@/types/travel";
import {
  TRIP_STATUS_LABELS,
  isTripFinished,
  normalizeTripActivityCategory,
  sumTripSpent,
} from "@/domain/travel";
import { sortVisitsForDay } from "@/domain/itinerary/visits";
import { tripLedgerDescription } from "@/domain/travel/ledger";
import {
  assignStopToDate,
  destinationFieldsFromStops,
  stopForDate,
  type TripStopInput,
} from "@/domain/travel/tripStops";
import {
  transferArrivesAtLocation,
  transferTimesConflictWithVisits,
  visitTimeConflictsWithTransfers,
  isTransportActivity,
} from "@/domain/travel/interDayTransfers";
import {
  endpointsFromTransferTitle,
  hasRequiredTransferEndpoints,
  normalizeTripTransportMode,
  transferEndpointsTitle,
  transportModeHasBoarding,
} from "@/domain/travel/transportModes";
import type {
  TripActivityAsset,
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
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { TripBudgetSummary } from "./components/TripBudgetSummary";
import { TripItineraryTab } from "./components/TripItineraryTab";
import { TripExpensesTab } from "./components/TripExpensesTab";
import { TripPlacesTab } from "./components/TripPlacesTab";
import { TripMilestonesTab } from "./components/TripMilestonesTab";
import {
  TripEditDayDialog,
  type DayForm,
} from "./components/TripEditDayDialog";
import {
  TripEditActivityDialog,
  type ActivityForm,
} from "./components/TripEditActivityDialog";
import { TripExpenseFormDialog } from "./components/TripExpenseFormDialog";
import { TripSplitRegisterDialog } from "./components/TripSplitRegisterDialog";
import { TripMilestoneFormDialog } from "./components/TripMilestoneFormDialog";
import { TripRoundTripDialog } from "./components/TripRoundTripDialog";
import { TripActivityAssetsDialog } from "./components/TripActivityAssetsDialog";

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
  const [savedPlaces, setSavedPlaces] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [registerExpense, setRegisterExpense] = useState(false);
  const [classId, setClassId] = useState(0);
  const [splitRegisterExpense, setSplitRegisterExpense] =
    useState<TripExpense | null>(null);

  const needDimensions = expenseDialogOpen || registerExpense || !!splitRegisterExpense;
  const { dimensions } = useDimensions({ enabled: needDimensions });
  const { toast } = useToast();
  useBreadcrumbTitle(trip?.title);

  const [editTripOpen, setEditTripOpen] = useState(false);
  const [roundTripOpen, setRoundTripOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showPacking, setShowPacking] = useState(false);

  const [editingDay, setEditingDay] = useState<TripItineraryDay | null>(null);
  const [dayForm, setDayForm] = useState<DayForm>({
    title: "",
    notes: "",
    stop: null,
  });
  const [editingActivity, setEditingActivity] =
    useState<TripItineraryActivity | null>(null);
  /** Linha do roteiro cujos assets estão abertos (feature 102) — `null` = diálogo fechado. */
  const [assetsActivity, setAssetsActivity] =
    useState<TripItineraryActivity | null>(null);
  const [addingDayId, setAddingDayId] = useState<string | null>(null);
  const [activityForm, setActivityForm] = useState<ActivityForm>({
    title: "",
    activity_time: "",
    arrival_time: "",
    boarding_time: "",
    transport_mode: "other",
    notes: "",
    link_url: "",
    is_reserved: false,
    category: "attraction",
    place_visit_id: null,
    linked_place_label: null,
    pending_catalog: null,
    origin: null,
    destination: null,
  });

  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);

  const [selectedPlace, setSelectedPlace] = useState<PlaceVisit | null>(null);
  const [placeDetailOpen, setPlaceDetailOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<PlaceVisit | null>(null);
  const [placeEditOpen, setPlaceEditOpen] = useState(false);
  const [placeFormIntent, setPlaceFormIntent] = useState<
    "create" | "edit" | "register_visit"
  >("edit");

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
      const [bundle, unlinked] = await Promise.all([
        fetchTripDetailBundle(id),
        fetchUnlinkedToVisitPlaces().catch(() => [] as PlaceVisit[]),
      ]);
      if (!bundle) {
        setTrip(null);
        setPlaces([]);
        setSavedPlaces([]);
        setMembers([]);
        setLoading(false);
        return;
      }

      // First paint: viagem + lugares + membros (sem opiniões / ensure).
      setTrip(bundle.trip);
      setPlaces(bundle.places);
      setSavedPlaces(unlinked);
      setMembers(bundle.members);
      setLoading(false);

      if (bundle.trip.user_id) {
        void ensureTripOwnerMember(id, bundle.trip.user_id).catch(() => undefined);
      }
      if (bundle.places.length > 0) {
        void enrichPlacesWithOpinions(bundle.places)
          .then(setPlaces)
          .catch(() => undefined);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
        variant: "destructive",
      });
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const weatherStops = useMemo(() => {
    if (!trip) return [];
    const fromStops =
      trip.stops
        ?.filter(
          (s) =>
            typeof s.lat === "number" &&
            typeof s.lng === "number" &&
            Number.isFinite(s.lat) &&
            Number.isFinite(s.lng)
        )
        .map((s) => ({
          name: s.name,
          lat: s.lat as number,
          lng: s.lng as number,
          startDate: s.start_date,
          endDate: s.end_date,
        })) ?? [];
    if (fromStops.length > 0) return fromStops;
    if (
      trip.destination_lat != null &&
      trip.destination_lng != null &&
      Number.isFinite(trip.destination_lat) &&
      Number.isFinite(trip.destination_lng)
    ) {
      return [
        {
          name: trip.destination ?? undefined,
          lat: trip.destination_lat,
          lng: trip.destination_lng,
          startDate: trip.start_date,
          endDate: trip.end_date,
        },
      ];
    }
    return [];
  }, [trip]);

  if (loading) {
    return (
      <PageShell title="Viagem">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded-md bg-muted/70" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
          </div>
          <TableLoadingSkeleton rows={6} />
        </div>
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
  const tripFinished = isTripFinished({
    endDate: trip.end_date,
    status: trip.status,
    todayIso: formatLocalIsoDate(new Date()),
  });
  const hasBudget = trip.budget != null && trip.budget > 0;
  const budgetProgress = hasBudget
    ? Math.min(100, (trip.expenseTotal / (trip.budget as number)) * 100)
    : 0;
  const overBudget = hasBudget && (trip.budgetRemaining ?? 0) < 0;

  function openExpenseCreate() {
    setEditingExpense(null);
    setExpenseForm(emptyExpenseForm());
    setRegisterExpense(false);
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
    setClassId(0);
    setExpenseDialogOpen(true);
    if (exp.transaction_id) {
      void fetchTransactionClassMeta(exp.transaction_id)
        .then((meta) => {
          if (!meta) return;
          setClassId(meta.class_id);
        })
        .catch(() => undefined);
    }
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

    if (!editingExpense && registerExpense && !classId) {
      toast({
        title: "Selecione a categoria",
        description:
          "Para registrar em Finanças, escolha a categoria da despesa.",
        variant: "destructive",
      });
      return;
    }

    if (editingExpense?.transaction_id && !classId) {
      toast({
        title: "Selecione a categoria",
        description: "Este gasto está no extrato, escolha a categoria.",
        variant: "destructive",
      });
      return;
    }

    const visibility =
      members.length > 1
        ? (expenseForm.visibility ?? "personal")
        : "personal";
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
        const linked = Boolean(editingExpense.transaction_id);
        await updateTripExpense(
          {
            id: editingExpense.id,
            trip_id: trip!.id,
            ...expenseForm,
            splits,
          },
          linked
            ? {
                syncTransaction: {
                  value: expenseForm.amount,
                  description: tripLedgerDescription(
                    trip!.title,
                    expenseForm.description
                  ),
                  transaction_at: new Date(
                    `${expenseForm.expense_date}T12:00:00`
                  ).toISOString(),
                  class_id: classId > 0 ? classId : undefined,
                },
              }
            : undefined
        );
        const nextExpenses = trip!.expenses.map((e) =>
          e.id !== editingExpense.id
            ? e
            : {
                ...e,
                ...expenseForm,
                visibility,
              }
        );
        const expenseTotal = sumTripSpent(
          nextExpenses,
          Boolean(trip!.isShared)
        );
        setTrip((prev) =>
          prev
            ? {
                ...prev,
                expenses: nextExpenses,
                expenseTotal,
                budgetRemaining:
                  prev.budget != null ? prev.budget - expenseTotal : null,
                spent: expenseTotal,
              }
            : prev
        );
        toast({
          title: linked ? "Gasto e extrato atualizados!" : "Gasto atualizado!",
          duration: 2000,
        });
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
                description: tripLedgerDescription(
                  trip!.title,
                  expenseForm.description
                ),
                transaction_at: new Date(
                  `${expenseForm.expense_date}T12:00:00`
                ).toISOString(),
              }
            : null;

        const created = await createTripExpense(
          { ...expenseForm, trip_id: trip!.id, splits },
          transaction
        );
        const nextExpenses = [...trip!.expenses, created];
        const expenseTotal = sumTripSpent(
          nextExpenses,
          Boolean(trip!.isShared)
        );
        setTrip((prev) =>
          prev
            ? {
                ...prev,
                expenses: nextExpenses,
                expenseTotal,
                budgetRemaining:
                  prev.budget != null ? prev.budget - expenseTotal : null,
                spent: expenseTotal,
              }
            : prev
        );
        toast({ title: "Gasto registrado!", duration: 2000 });
      }
      setExpenseDialogOpen(false);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
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
        const patch = {
          title: milestoneForm.title.trim(),
          type: milestoneForm.type,
          due_date: milestoneForm.due_date,
          notes: milestoneForm.notes.trim() || null,
        };
        await updateTripMilestone({
          id: editingMilestone.id,
          ...patch,
        });
        setTrip((prev) =>
          prev
            ? {
                ...prev,
                milestones: prev.milestones.map((m) =>
                  m.id !== editingMilestone.id ? m : { ...m, ...patch }
                ),
              }
            : prev
        );
        toast({ title: "Prazo atualizado!", duration: 2000 });
      } else {
        const created = await createTripMilestone({
          trip_id: trip!.id,
          title: milestoneForm.title.trim(),
          type: milestoneForm.type,
          due_date: milestoneForm.due_date,
          notes: milestoneForm.notes.trim() || null,
          done: false,
        });
        setTrip((prev) =>
          prev
            ? { ...prev, milestones: [...prev.milestones, created] }
            : prev
        );
        toast({ title: "Prazo adicionado!", duration: 2000 });
      }
      setMilestoneDialogOpen(false);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
        variant: "destructive",
      });
    }
  }

  function emptyActivityForm(): ActivityForm {
    return {
      title: "",
      activity_time: "",
      arrival_time: "",
      boarding_time: "",
      transport_mode: "other",
      notes: "",
      link_url: "",
      is_reserved: false,
      category: "attraction",
      place_visit_id: null,
      linked_place_label: null,
      pending_catalog: null,
      origin: null,
      destination: null,
    };
  }

  function openAddActivity(dayId: string) {
    setEditingActivity(null);
    setAddingDayId(dayId);
    setActivityForm(emptyActivityForm());
  }

  function openAddTransfer(dayId: string) {
    setEditingActivity(null);
    setAddingDayId(dayId);
    setActivityForm({
      ...emptyActivityForm(),
      category: "transport",
      transport_mode: "car",
      is_reserved: false,
    });
  }

  function openActivityEdit(act: TripItineraryActivity) {
    setAddingDayId(null);
    setEditingActivity(act);
    const linked = places.find((p) => p.id === act.place_visit_id);
    const isTransfer =
      normalizeTripActivityCategory(act.category) === "transport";
    const fromTitle = isTransfer
      ? endpointsFromTransferTitle(act.title)
      : null;
    const originLabel = act.origin_label?.trim() || fromTitle?.originLabel;
    const destinationLabel =
      act.destination_label?.trim() || fromTitle?.destinationLabel;
    setActivityForm({
      title: act.title,
      activity_time: act.activity_time ?? "",
      arrival_time: act.arrival_time ?? "",
      boarding_time: act.boarding_time ?? "",
      transport_mode: normalizeTripTransportMode(act.transport_mode),
      notes: act.notes ?? "",
      link_url: act.link_url ?? "",
      is_reserved: Boolean(act.is_reserved),
      category: normalizeTripActivityCategory(act.category),
      place_visit_id: act.place_visit_id ?? null,
      linked_place_label: linked?.name ?? null,
      pending_catalog: null,
      origin: isTransfer && originLabel
        ? {
            label: originLabel,
            lat: act.origin_lat ?? null,
            lng: act.origin_lng ?? null,
            place_id: act.origin_place_id ?? null,
          }
        : null,
      destination: isTransfer && destinationLabel
        ? {
            label: destinationLabel,
            lat: act.destination_lat ?? null,
            lng: act.destination_lng ?? null,
            place_id: act.destination_place_id ?? null,
          }
        : null,
    });
  }

  async function resolvePlaceVisitId(form: ActivityForm): Promise<string | null> {
    if (form.place_visit_id) return form.place_visit_id;
    const pick = form.pending_catalog;
    if (!pick || !trip) return null;
    const created = await createPlace({
      trip_id: trip.id,
      name: pick.name,
      type: pick.type,
      status: "to_visit",
      rating: null,
      notes: null,
      visited_date: null,
      amount: null,
      transaction_id: null,
      address: pick.address,
      lat: pick.lat,
      lng: pick.lng,
      google_place_id: pick.google_place_id,
      geoapify_place_id: null,
      would_recommend: true,
    });
    setPlaces((prev) => [created, ...prev]);
    return created.id;
  }

  async function handleSaveActivity(form: ActivityForm) {
    const isTransfer = form.category === "transport";
    if (isTransfer) {
      if (
        !hasRequiredTransferEndpoints(
          form.origin?.label,
          form.destination?.label
        )
      ) {
        toast({
          title: "Origem e destino obrigatórios",
          description: "Escolha país, estado ou cidade em ambos.",
          variant: "destructive",
        });
        return;
      }
    } else if (!form.title.trim()) {
      toast({
        title: "Informe o título do evento",
        variant: "destructive",
      });
      return;
    }
    const dayId = addingDayId ?? editingActivity?.day_id ?? null;
    if (!trip || !dayId) return;

    const day = trip.itinerary.find((d) => d.id === dayId);
    const dayStop =
      day?.date && trip.stops?.length
        ? stopForDate(trip.stops, day.date)
        : null;
    const linkedPlace = form.place_visit_id
      ? places.find((p) => p.id === form.place_visit_id)
      : null;
    const atLocation = {
      lat:
        form.pending_catalog?.lat ??
        linkedPlace?.lat ??
        dayStop?.lat ??
        null,
      lng:
        form.pending_catalog?.lng ??
        linkedPlace?.lng ??
        dayStop?.lng ??
        null,
      label:
        form.pending_catalog?.name ??
        linkedPlace?.name ??
        dayStop?.name ??
        null,
    };

    if (isTransfer) {
      const arrivesAtDayLocation = transferArrivesAtLocation(
        {
          origin_label: form.origin?.label,
          origin_lat: form.origin?.lat,
          origin_lng: form.origin?.lng,
          destination_label: form.destination?.label,
          destination_lat: form.destination?.lat,
          destination_lng: form.destination?.lng,
        },
        dayStop
          ? {
              lat: dayStop.lat,
              lng: dayStop.lng,
              label: dayStop.name,
            }
          : atLocation
      );
      const conflict = transferTimesConflictWithVisits({
        dayId,
        departTime: form.activity_time,
        arriveTime: form.arrival_time,
        days: trip.itinerary,
        excludeActivityId: editingActivity?.id,
        arrivesAtDayLocation,
      });
      if (conflict) {
        toast({
          title: "Horário conflita com evento",
          description: conflict.message,
          variant: "destructive",
        });
        return;
      }
    } else {
      const conflict = visitTimeConflictsWithTransfers({
        dayId,
        activityTime: form.activity_time,
        days: trip.itinerary,
        excludeActivityId: editingActivity?.id,
        atLocation,
      });
      if (conflict) {
        toast({
          title: "Horário antes da chegada",
          description: conflict.message,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const placeVisitId = isTransfer ? null : await resolvePlaceVisitId(form);
      const title = isTransfer
        ? transferEndpointsTitle(
            form.origin!.label,
            form.destination!.label
          )
        : form.title.trim();
      const transferFields = isTransfer
        ? {
            origin_label: form.origin!.label.trim(),
            origin_lat: form.origin!.lat,
            origin_lng: form.origin!.lng,
            origin_place_id: form.origin!.place_id,
            destination_label: form.destination!.label.trim(),
            destination_lat: form.destination!.lat,
            destination_lng: form.destination!.lng,
            destination_place_id: form.destination!.place_id,
            transport_mode: form.transport_mode,
            arrival_time: form.arrival_time.trim() || null,
            // Só grava embarque no modo que tem embarque: trocar de voo para carro limpa o campo em
            // vez de deixar um horário órfão que a UI nunca mais mostraria.
            boarding_time: transportModeHasBoarding(form.transport_mode)
              ? form.boarding_time.trim() || null
              : null,
          }
        : {
            origin_label: null,
            origin_lat: null,
            origin_lng: null,
            origin_place_id: null,
            destination_label: null,
            destination_lat: null,
            destination_lng: null,
            destination_place_id: null,
            transport_mode: null,
            arrival_time: null,
            boarding_time: null,
          };

      if (addingDayId) {
        const day = trip.itinerary.find((d) => d.id === addingDayId);
        const created = await createItineraryActivity({
          day_id: addingDayId,
          title,
          activity_time: form.activity_time.trim() || null,
          notes: form.notes.trim() || null,
          link_url: form.link_url.trim() || null,
          is_reserved: form.is_reserved,
          category: normalizeTripActivityCategory(form.category),
          place_visit_id: placeVisitId,
          sort_order: (day?.activities?.length ?? 0) + 1,
          ...transferFields,
        });
        setTrip((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            itinerary: prev.itinerary.map((d) =>
              d.id !== addingDayId
                ? d
                : {
                    ...d,
                    activities: [...(d.activities ?? []), created],
                  }
            ),
          };
        });
        toast({
          title: isTransfer ? "Deslocamento adicionado!" : "Evento adicionado!",
          duration: 2000,
        });
        setAddingDayId(null);
      } else if (editingActivity) {
        const activityPatch = {
          title,
          activity_time: form.activity_time.trim() || null,
          notes: form.notes.trim() || null,
          link_url: form.link_url.trim() || null,
          is_reserved: form.is_reserved,
          category: normalizeTripActivityCategory(form.category),
          place_visit_id: placeVisitId,
          ...transferFields,
        };
        await updateItineraryActivity({
          id: editingActivity.id,
          ...activityPatch,
        });
        setTrip((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            itinerary: prev.itinerary.map((d) => ({
              ...d,
              activities: (d.activities ?? []).map((act) =>
                act.id !== editingActivity.id
                  ? act
                  : { ...act, ...activityPatch }
              ),
            })),
          };
        });
        toast({
          title: isTransfer ? "Deslocamento atualizado!" : "Evento atualizado!",
          duration: 2000,
        });
        setEditingActivity(null);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
        variant: "destructive",
      });
    }
  }

  function patchVisitStatusLocal(
    actId: string,
    status: "pending" | "completed" | "skipped"
  ) {
    const now = new Date().toISOString();
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        itinerary: prev.itinerary.map((day) => ({
          ...day,
          activities: (day.activities ?? []).map((act) =>
            act.id !== actId
              ? act
              : {
                  ...act,
                  visit_status: status,
                  completed_at: status === "completed" ? now : null,
                  skipped_at: status === "skipped" ? now : null,
                }
          ),
        })),
      };
    });
  }

  function handleBeforeCompleteVisit(act: TripItineraryActivity): void {
    if (!act.place_visit_id) return;
    const place = places.find((p) => p.id === act.place_visit_id);
    if (!place) return;
    const today = new Date().toISOString().split("T")[0];
    setEditingPlace({
      ...place,
      status: "visited",
      visited_date: place.visited_date || today,
    });
    setPlaceFormIntent("register_visit");
    setPlaceEditOpen(true);
  }

  function handleVisitStatusChange(
    actId: string,
    status: "pending" | "completed" | "skipped"
  ) {
    patchVisitStatusLocal(actId, status);
    if (status !== "skipped") return;
    const act = trip?.itinerary
      .flatMap((d) => d.activities ?? [])
      .find((a) => a.id === actId);
    if (!act?.place_visit_id) return;
    const place = places.find((p) => p.id === act.place_visit_id);
    if (!place) return;
    if ((place.status ?? "visited") === "to_visit") return;
    void updatePlace({
      id: place.id,
      status: "to_visit",
      visited_date: null,
      rating: null,
      amount: null,
    })
      .then(() => load())
      .catch(() => undefined);
  }

  function patchActivityDeletedLocal(actId: string) {
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        itinerary: prev.itinerary.map((day) => ({
          ...day,
          activities: (day.activities ?? []).filter((act) => act.id !== actId),
        })),
      };
    });
  }

  /** Sobe a lista nova de assets para o estado local — o contador do card acompanha sem o bundle
   * inteiro voltar, no mesmo espírito de `patchActivityDeletedLocal`. */
  function patchActivityAssetsLocal(
    actId: string,
    assets: TripActivityAsset[]
  ) {
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        itinerary: prev.itinerary.map((day) => ({
          ...day,
          activities: (day.activities ?? []).map((act) =>
            act.id === actId ? { ...act, assets } : act
          ),
        })),
      };
    });
  }

  async function handleAddSavedPlaceToDay(place: PlaceVisit, dayId: string) {
    if (!trip) return;
    try {
      if (place.trip_id !== trip.id) {
        await updatePlace({ id: place.id, trip_id: trip.id });
        const linked = { ...place, trip_id: trip.id };
        setPlaces((prev) => [
          linked,
          ...prev.filter((item) => item.id !== place.id),
        ]);
        setSavedPlaces((prev) => prev.filter((item) => item.id !== place.id));
      }
      const day = trip.itinerary.find((item) => item.id === dayId);
      const created = await createItineraryActivity({
        day_id: dayId,
        title: place.name.trim(),
        activity_time: null,
        notes: place.notes?.trim() || null,
        link_url: null,
        is_reserved: false,
        category: normalizeTripActivityCategory(place.type),
        place_visit_id: place.id,
        sort_order: (day?.activities?.length ?? 0) + 1,
      });
      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          itinerary: prev.itinerary.map((item) =>
            item.id !== dayId
              ? item
              : {
                  ...item,
                  activities: [...(item.activities ?? []), created],
                }
          ),
        };
      });
      toast({ title: "Adicionado ao roteiro", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível adicionar o lugar."
        ),
        variant: "destructive",
      });
    }
  }

  function moveVisitToDay(
    actId: string,
    targetDayId: string,
    targetIndex: number
  ) {
    if (!trip) return;
    const sourceDay = trip.itinerary.find((day) =>
      (day.activities ?? []).some((activity) => activity.id === actId)
    );
    const targetDay = trip.itinerary.find((day) => day.id === targetDayId);
    const moving = sourceDay?.activities?.find(
      (activity) => activity.id === actId
    );
    if (!sourceDay || !targetDay || !moving) return;

    if (!isTransportActivity(moving) && moving.activity_time) {
      const dayStop =
        targetDay.date && trip.stops?.length
          ? stopForDate(trip.stops, targetDay.date)
          : null;
      const linkedPlace = moving.place_visit_id
        ? places.find((p) => p.id === moving.place_visit_id)
        : null;
      const conflict = visitTimeConflictsWithTransfers({
        dayId: targetDayId,
        activityTime: moving.activity_time,
        days: trip.itinerary,
        atLocation: {
          lat: linkedPlace?.lat ?? dayStop?.lat ?? null,
          lng: linkedPlace?.lng ?? dayStop?.lng ?? null,
          label: linkedPlace?.name ?? dayStop?.name ?? null,
        },
      });
      if (conflict) {
        toast({
          title: "Horário antes da chegada",
          description: conflict.message,
          variant: "destructive",
        });
        return;
      }
    }

    const sortActivities = (activities: TripItineraryActivity[]) =>
      sortVisitsForDay(activities);
    const sourceWithoutMoving = sortActivities(
      (sourceDay.activities ?? []).filter((activity) => activity.id !== actId)
    );
    const targetWithoutMoving =
      sourceDay.id === targetDayId
        ? sourceWithoutMoving
        : sortActivities(
            (targetDay.activities ?? []).filter(
              (activity) => activity.id !== actId
            )
          );
    const movedActivity: TripItineraryActivity = {
      ...moving,
      day_id: targetDayId,
    };
    const targetActivities = [...targetWithoutMoving];
    targetActivities.splice(
      Math.max(0, Math.min(targetIndex, targetActivities.length)),
      0,
      movedActivity
    );
    const normalizedTarget = targetActivities.map((activity, index) => ({
      ...activity,
      sort_order: index,
    }));
    const normalizedSource =
      sourceDay.id === targetDayId
        ? normalizedTarget
        : sourceWithoutMoving.map((activity, index) => ({
            ...activity,
            sort_order: index,
          }));

    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        itinerary: prev.itinerary.map((day) => {
          if (day.id === targetDayId) {
            return { ...day, activities: normalizedTarget };
          }
          if (day.id === sourceDay.id) {
            return { ...day, activities: normalizedSource };
          }
          return day;
        }),
      };
    });

    const affectedActivities =
      sourceDay.id === targetDayId
        ? normalizedTarget
        : [...normalizedSource, ...normalizedTarget];
    void Promise.all(
      affectedActivities.map((activity) =>
        updateItineraryActivity({
          id: activity.id,
          day_id: activity.day_id,
          sort_order: activity.sort_order,
        })
      )
    ).catch(() => {
      toast({
        title: "Erro ao mover evento",
        description: "Não foi possível salvar a nova ordem. Recarregando…",
        variant: "destructive",
      });
      load();
    });
  }

  function openDayEdit(day: TripItineraryDay) {
    setEditingDay(day);
    const currentStop =
      day.date && trip?.stops?.length
        ? stopForDate(trip.stops, day.date)
        : null;
    setDayForm({
      title: day.title ?? `Dia ${day.day_number}`,
      notes: day.notes ?? "",
      stop: currentStop
        ? {
            name: currentStop.name,
            place_id: currentStop.place_id ?? null,
            lat: currentStop.lat ?? null,
            lng: currentStop.lng ?? null,
            start_date: day.date!,
            end_date: day.date!,
          }
        : null,
    });
  }

  async function handleSaveDay(form: DayForm) {
    if (!editingDay || !trip) return;
    const dayId = editingDay.id;
    const dayDate = editingDay.date;
    const title = form.title.trim() || null;
    const notes = form.notes.trim() || null;

    // Fecha o diálogo na hora; persiste em background.
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        itinerary: prev.itinerary.map((day) =>
          day.id !== dayId ? day : { ...day, title, notes }
        ),
      };
    });
    setEditingDay(null);
    toast({ title: "Dia atualizado!", duration: 2000 });

    try {
      await updateItineraryDayNotes(dayId, notes, title);

      const stopName = form.stop?.name.trim();
      if (!stopName || !dayDate) return;

      const currentStop = trip.stops?.length
        ? stopForDate(trip.stops, dayDate)
        : null;
      const sameStop =
        currentStop &&
        currentStop.name.trim() === stopName &&
        (currentStop.place_id ?? null) === (form.stop?.place_id ?? null) &&
        (currentStop.lat ?? null) === (form.stop?.lat ?? null) &&
        (currentStop.lng ?? null) === (form.stop?.lng ?? null);
      if (sameStop) return;

      const currentInputs: TripStopInput[] = (trip.stops ?? []).map(
        (s, i) => ({
          name: s.name,
          place_id: s.place_id ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          start_date: s.start_date,
          end_date: s.end_date,
          sort_order: s.sort_order ?? i,
        })
      );
      const nextStops = assignStopToDate(currentInputs, dayDate, {
        name: stopName,
        place_id: form.stop?.place_id ?? null,
        lat: form.stop?.lat ?? null,
        lng: form.stop?.lng ?? null,
      });
      const savedStops = await replaceTripStops(trip.id, nextStops);
      const dest = destinationFieldsFromStops(nextStops);
      await updateTrip({
        id: trip.id,
        ...dest,
      });
      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...dest,
          stops: savedStops.length > 0 ? savedStops : prev.stops,
        };
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar o dia",
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
        variant: "destructive",
      });
      load();
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
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
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
        description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
        variant: "destructive",
      });
    }
  }

  return (
    <TripWeatherProvider stops={weatherStops}>
    <PageShell
      title={trip.title}
      description={trip.destination ?? undefined}
      eyebrow="Viagens"
      actions={
        trip.daysUntilStart != null && trip.daysUntilStart >= 0 ? (
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums leading-none text-primary sm:text-3xl">
              {trip.daysUntilStart}
            </p>
            <p className="text-[10px] text-muted-foreground">dias</p>
          </div>
        ) : null
      }
    >
      {weatherStops.length > 0 ? (
        <div className="mb-3 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-pressed={showPacking}
            onClick={() => setShowPacking((v) => !v)}
          >
            <Shirt className="h-4 w-4" />
            {showPacking ? "Ocultar mala" : "O que levar na mala"}
          </Button>
          {showPacking ? (
            <TripWeatherPackingPanel stops={weatherStops} />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
            <Link to="/travel" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status]}</Badge>
          {trip.isShared ? (
            <Badge variant="secondary">Compartilhada</Badge>
          ) : null}
          {isOngoing ? (
            <Badge className="bg-success text-success-foreground">
              Em viagem agora
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground sm:text-sm">
            {formatDateBR(trip.start_date)} → {formatDateBR(trip.end_date)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-background p-0.5 sm:gap-1">
          <TripMembersDialog
            tripId={trip.id}
            myRole={trip.myRole}
            isShared={trip.isShared}
            onChanged={load}
            compact
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShareOpen(true)}
            aria-label="Compartilhar viagem"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(ICON_EDIT_BUTTON_CLASS, "h-8 w-8")}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                aria-label="Excluir viagem"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </ConfirmDeleteDialog>
          ) : null}
        </div>
      </div>

      {trip.notes ? (
        <p className="text-sm text-muted-foreground">{trip.notes}</p>
      ) : null}

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
          tripId={trip.id}
          itinerary={trip.itinerary}
          places={places}
          savedPlaces={savedPlaces}
          members={members}
          user={user}
          tripOrigin={
            trip.origin_lat != null && trip.origin_lng != null
              ? { lat: trip.origin_lat, lng: trip.origin_lng }
              : null
          }
          originLabel={trip.origin_label}
          destinationLat={trip.destination_lat}
          destinationLng={trip.destination_lng}
          destinationName={trip.destination}
          destinationPlaceId={trip.destination_place_id}
          stops={trip.stops}
          disableRoutes={tripFinished}
          onEditDay={openDayEdit}
          onEditActivity={openActivityEdit}
          onAddActivity={openAddActivity}
          onAddTransfer={openAddTransfer}
          hasRoundTrip={Boolean(trip.origin_label)}
          onManageRoundTrip={() => setRoundTripOpen(true)}
          onReload={load}
          onVisitStatusChange={handleVisitStatusChange}
          onBeforeCompleteVisit={handleBeforeCompleteVisit}
          onActivityDeleted={patchActivityDeletedLocal}
          onOpenAssets={setAssetsActivity}
          onMoveVisit={moveVisitToDay}
          onAddSavedPlace={handleAddSavedPlaceToDay}
        />

        <TripExpensesTab
          trip={trip}
          hasBudget={hasBudget}
          user={user}
          onCreate={openExpenseCreate}
          onEdit={openExpenseEdit}
          onRegisterSplit={(exp) => {
            setSplitRegisterExpense(exp);
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

      <TripRoundTripDialog
        trip={trip}
        open={roundTripOpen}
        onOpenChange={setRoundTripOpen}
        onSaved={load}
      />

      <TripEditDayDialog
        open={!!editingDay}
        onOpenChange={(open) => {
          if (!open) setEditingDay(null);
        }}
        form={dayForm}
        onSave={(f) => void handleSaveDay(f)}
      />

      <TripEditActivityDialog
        open={!!editingActivity || !!addingDayId}
        mode={addingDayId ? "create" : "edit"}
        onOpenChange={(open) => {
          if (!open) {
            setEditingActivity(null);
            setAddingDayId(null);
          }
        }}
        form={activityForm}
        places={places}
        onSave={(f) => void handleSaveActivity(f)}
      />

      <TripActivityAssetsDialog
        open={!!assetsActivity}
        onOpenChange={(open) => {
          if (!open) setAssetsActivity(null);
        }}
        tripId={trip.id}
        activity={assetsActivity}
        onAssetsChange={patchActivityAssetsLocal}
        // Viagem encerrada: a lista continua abrível (é justamente quando se quer rever o
        // comprovante), só não se anexa nem apaga mais nada.
        readOnly={tripFinished}
      />

      <TripExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        editing={!!editingExpense}
        linkedToLedger={Boolean(editingExpense?.transaction_id)}
        form={expenseForm}
        onChange={setExpenseForm}
        memberCount={members.length}
        registerExpense={registerExpense}
        onRegisterExpenseChange={(checked) => {
          setRegisterExpense(checked);
          if (!checked) {
            setClassId(0);
          }
        }}
        classId={classId}
        onClassIdChange={setClassId}
        dimensions={dimensions}
        onSave={() => void handleSaveExpense()}
      />

      <TripSplitRegisterDialog
        expense={splitRegisterExpense}
        onOpenChange={(open) => {
          if (!open) setSplitRegisterExpense(null);
        }}
        userId={user?.id}
        classId={classId}
        onClassIdChange={setClassId}
        dimensions={dimensions}
        onConfirm={() =>
          void (async () => {
            if (!splitRegisterExpense) return;
            try {
              await registerMyExpenseSplit(splitRegisterExpense.id, {
                class_id: classId,
                value: 0,
                description: tripLedgerDescription(
                  trip.title,
                  splitRegisterExpense.description,
                  { shareSlice: true }
                ),
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
                description: getErrorMessage(error, "Não foi possível atualizar a viagem."),
                variant: "destructive",
              });
            }
          })()
        }
      />

      <TripMilestoneFormDialog
        open={milestoneDialogOpen}
        onOpenChange={setMilestoneDialogOpen}
        editing={!!editingMilestone}
        form={milestoneForm}
        onChange={setMilestoneForm}
        onSave={() => void handleSaveMilestone()}
      />

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
          setPlaceFormIntent("edit");
          setPlaceDetailOpen(false);
          setPlaceEditOpen(true);
        }}
        onMarkVisited={() => {
          if (!selectedPlace) return;
          const today = new Date().toISOString().split("T")[0];
          setEditingPlace({
            ...selectedPlace,
            status: "visited",
            visited_date: selectedPlace.visited_date || today,
          });
          setPlaceFormIntent("register_visit");
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
        intent={placeFormIntent}
        open={placeEditOpen}
        onOpenChange={(open) => {
          setPlaceEditOpen(open);
          if (!open) {
            setEditingPlace(null);
            setPlaceFormIntent("edit");
          }
        }}
        onSaved={load}
      />
    </PageShell>
    </TripWeatherProvider>
  );
}
