/**
 * Executa uma proposta da Orb (feature 100) — o lado do CLIENT da criação com confirmação.
 *
 * Grava pelas MESMAS funções que os formulários do app usam. Não é preferência de estilo: é o que
 * garante que uma tarefa criada pela Orb passe pelas mesmas validações, pelos mesmos vínculos e
 * pelos mesmos defaults que a criada na tela — e que ela continue passando quando essas regras
 * mudarem. Um `insert` próprio aqui envelheceria em silêncio.
 *
 * O payload que chega vem pelo stream e é reconstruído campo a campo por
 * `sanitizeOrbProposalPayload` antes de virar `insert`: nada que o modelo escreveu entra no banco
 * sem passar pela whitelist do tipo.
 */

import { createNote } from "@/api/notes/notes";
import { createShoppingItem } from "@/api/shopping/items";
import { createProject, createProjectEvent, createTask } from "@/api/tasks";
import { createTransactionApi } from "@/api/finance/transactions";
import {
  createMonthlyBudgetApi,
  deleteMonthlyBudgetApi,
  duplicateMonthlyBudgetApi,
} from "@/api/finance/budget";
import { createClassApi, createTypeApi } from "@/api/finance/dimensions";
import {
  createRecurringApi,
  softDeleteRecurring,
  updateRecurringParcelPayment,
  fetchRecurringTransactions,
} from "@/api/recurring";
import { toggleHabitLog, createHabit } from "@/api/habits";
import { fetchMovieById, updateMovie, upsertMovie } from "@/api/movies";
import { fetchBookById, updateBook, createBook } from "@/api/books";
import { createAlbum, updateAlbum } from "@/api/albums";
import { findMovieByTitleYear, findSeriesByTitleYear } from "@/lib/omdb";
import { searchGoogleBooks, fetchGoogleBookById } from "@/lib/googleBooks";
import { markEpisodeWatched } from "@/api/movieEpisodes";
import { createMedicationWithDoses } from "@/api/health/medications";
import { emptyTask } from "@/domain/tasks/taskDraft";
import {
  createPlace,
  createPlaceVisitOccurrence,
} from "@/api/places";
import { fetchGoals, updateGoal } from "@/api/goals";
import { createFuelLog, createMaintenance, createVehicle } from "@/api/car";
import {
  createTrip,
  createTripExpense,
  createItineraryActivity,
  fetchTripItineraryLite,
  fetchTrips,
} from "@/api/travel";
import {
  canEstimateTransferArrival,
  routesModeForTransport,
  transferEndpointsTitle,
  transferEndpointHasCoords,
  type TripTransportMode,
  type TransferEndpoint,
} from "@/domain/travel/transportModes";
import {
  listOrbTripTransfers,
  resolveTransferTimes,
} from "@/domain/orb/tripTransfers";
import { searchPlaces } from "@/lib/googlePlaces";
import { fetchTravelRoutes } from "@/lib/googleRoutes";
import { MovieStatus } from "@/types/movies";
import type { BookStatus } from "@/types/books";
import type { AlbumStatus } from "@/types/music";
import type { PlaceType } from "@/types/places";
import type { MaintenanceType, VehicleKind } from "@/types/car";
import type { TripExpenseCategory, TripActivityCategory } from "@/types/travel";
import type { HabitFrequency, HabitKind } from "@/types/habits";
import {
  sanitizeOrbProposalPayload,
  type OrbProposal,
} from "../../supabase/functions/_shared/orb/actions.ts";

export interface OrbProposalOutcome {
  /** Frase curta de sucesso, para o cartão: "Tarefa criada." */
  message: string;
  /** Para onde ir ver o que foi criado. */
  link?: string;
}

function texto(payload: Record<string, unknown>, chave: string): string | null {
  const valor = payload[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function numero(payload: Record<string, unknown>, chave: string): number | null {
  const valor = payload[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

type ResolvedPlace = TransferEndpoint;

async function resolverRegiao(nome: string): Promise<ResolvedPlace> {
  const label = nome.trim();
  const base: ResolvedPlace = {
    label,
    lat: null,
    lng: null,
    place_id: null,
  };
  try {
    const hits = await searchPlaces({ query: label, scope: "regions" });
    const hit = hits[0];
    if (!hit) return base;
    return {
      label: hit.name?.trim() || label,
      lat: hit.lat,
      lng: hit.lng,
      place_id: hit.placeId ?? null,
    };
  } catch {
    return base;
  }
}

async function duracaoTrechoSegundos(
  origin: ResolvedPlace,
  destination: ResolvedPlace,
  mode: TripTransportMode
): Promise<number | null> {
  if (!canEstimateTransferArrival(mode)) return null;
  const routesMode = routesModeForTransport(mode);
  if (!routesMode) return null;
  if (
    !transferEndpointHasCoords(origin) ||
    !transferEndpointHasCoords(destination)
  ) {
    return null;
  }
  try {
    const dest = destination.place_id
      ? { placeId: destination.place_id }
      : { lat: destination.lat!, lng: destination.lng! };
    const legs = await fetchTravelRoutes({
      origin: { lat: origin.lat!, lng: origin.lng! },
      destination: dest,
      modes: [routesMode],
    });
    const leg = legs.find((l) => l.mode === routesMode) ?? legs[0];
    if (!leg?.available || leg.durationSeconds == null) return null;
    return leg.durationSeconds;
  } catch {
    return null;
  }
}

export async function executeOrbProposal(proposal: OrbProposal): Promise<OrbProposalOutcome> {
  const payload = sanitizeOrbProposalPayload(proposal.kind, proposal.payload);
  if (!payload) {
    throw new Error("A proposta chegou incompleta e não foi gravada.");
  }

  switch (proposal.kind) {
    case "task": {
      const titulo = texto(payload, "title") ?? "Nova tarefa";
      const tarefa = await createTask({
        title: titulo,
        description: texto(payload, "description"),
        status: "todo",
        priority: (texto(payload, "priority") as "low" | "medium" | "high" | null) ?? null,
        due_date: texto(payload, "due_date"),
        due_time: texto(payload, "due_time"),
        start_date: texto(payload, "start_date"),
        estimated_duration: numero(payload, "estimated_duration"),
        project_id: texto(payload, "project_id"),
        parent_task_id: null,
        recurrence_rule: null,
        linked_recurring_id: null,
        tag_ids: [],
      });
      return {
        message: "Tarefa criada.",
        // Feature 102: agora existe destino por id. O link por título (`?q=`) era busca textual —
        // ele abre a tarefa errada quando o título se repete, e recorrência materializa dezenas de
        // tarefas com o mesmo nome.
        link: `/tasks?task=${encodeURIComponent(tarefa.id)}`,
      };
    }

    case "transaction": {
      const valor = numero(payload, "value");
      const classId = payload.class_id;
      if (valor === null || (typeof classId !== "number" && typeof classId !== "string")) {
        throw new Error("O lançamento chegou sem valor ou sem categoria.");
      }
      const descricao = texto(payload, "description") ?? "Lançamento";
      // `createTransactionApi` enfileira sozinha quando o navegador está offline — o cartão avisa.
      const { queued } = await createTransactionApi({
        value: valor,
        class_id: Number(classId),
        description: descricao,
        transaction_at: texto(payload, "transaction_at") ?? new Date().toISOString(),
      });
      return {
        message: queued ? "Lançamento na fila — vai subir quando a conexão voltar." : "Lançamento criado.",
        link: `/finance/transactions?q=${encodeURIComponent(descricao)}`,
      };
    }

    case "note": {
      const nota = await createNote({
        title: texto(payload, "title") ?? "Nova nota",
        content: texto(payload, "content") ?? "",
        project_id: texto(payload, "project_id"),
      });
      return { message: "Nota criada.", link: `/notes/${nota.id}` };
    }

    case "shopping_item": {
      await createShoppingItem({
        title: texto(payload, "title") ?? "Novo item",
        description: texto(payload, "description"),
        quantity: numero(payload, "quantity"),
        unit: texto(payload, "unit"),
        status: "pending",
        shopping_category_id: texto(payload, "shopping_category_id"),
      });
      return { message: "Item adicionado à lista.", link: "/shopping-list" };
    }

    case "project": {
      const projeto = await createProject({
        name: texto(payload, "name") ?? "Novo projeto",
        description: texto(payload, "description"),
        status: "active",
        tag_ids: [],
      });
      return { message: "Projeto criado.", link: `/tasks/projects/${projeto.id}` };
    }

    case "event": {
      const inicio = texto(payload, "starts_at");
      if (!inicio) throw new Error("O evento chegou sem data de início.");
      await createProjectEvent({
        title: texto(payload, "title") ?? "Novo evento",
        starts_at: inicio,
        ends_at: texto(payload, "ends_at"),
        project_id: texto(payload, "project_id"),
        // Vínculo com tarefa (066): o Orb cria evento de agenda, nunca evento *de tarefa* —
        // aquele nasce a partir da própria tarefa, não de um pedido em linguagem natural.
        task_id: null,
      });
      return { message: "Evento criado.", link: "/tasks/agenda" };
    }

    case "recurring": {
      const valor = numero(payload, "value");
      const classId = payload.class_id;
      const dueDay = numero(payload, "due_day");
      const start = texto(payload, "payment_start_date");
      const frequency = texto(payload, "frequency");
      if (
        valor === null ||
        (typeof classId !== "number" && typeof classId !== "string") ||
        dueDay === null ||
        !start ||
        !frequency
      ) {
        throw new Error("A recorrência chegou incompleta.");
      }
      const parcelas = numero(payload, "installment_count");
      const validity = texto(payload, "validity");
      await createRecurringApi({
        class_id: Number(classId),
        value: valor,
        description: texto(payload, "description") ?? "Recorrência",
        frequency,
        validity: validity ?? null,
        due_day: dueDay,
        installment_count: parcelas,
        payment_start_date: start,
        status: payload.status === false ? false : true,
        // A Orb lê o link, não grava: `propose_create` não tem o campo (feature 206).
        link_url: null,
      });
      return { message: "Recorrência criada.", link: "/finance/recurring" };
    }

    case "budget": {
      const valor = numero(payload, "planned_value");
      const typeId = payload.type_id;
      const classId = payload.class_id;
      const mes = texto(payload, "budget_month");
      if (
        valor === null ||
        (typeof typeId !== "number" && typeof typeId !== "string") ||
        (typeof classId !== "number" && typeof classId !== "string") ||
        !mes
      ) {
        throw new Error("O orçamento chegou incompleto.");
      }
      await createMonthlyBudgetApi({
        type_id: Number(typeId),
        class_id: Number(classId),
        budget_month: mes,
        planned_value: valor,
      });
      return { message: "Orçamento definido.", link: "/finance/budget" };
    }

    case "finance_type": {
      const nome = texto(payload, "name");
      const natureId = payload.nature_id;
      if (!nome || (typeof natureId !== "number" && typeof natureId !== "string")) {
        throw new Error("O tipo financeiro chegou incompleto.");
      }
      await createTypeApi({ name: nome, nature_id: Number(natureId) });
      return { message: "Tipo criado.", link: "/finance/categories" };
    }

    case "finance_class": {
      const nome = texto(payload, "name");
      const typeId = payload.type_id;
      if (!nome || (typeof typeId !== "number" && typeof typeId !== "string")) {
        throw new Error("A subcategoria chegou incompleta.");
      }
      await createClassApi({ name: nome, type_id: Number(typeId) });
      return { message: "Subcategoria criada.", link: "/finance/categories" };
    }

    case "budget_delete": {
      const id = payload.id;
      if (typeof id !== "number" && typeof id !== "string") {
        throw new Error("A exclusão de orçamento chegou sem id.");
      }
      await deleteMonthlyBudgetApi(Number(id));
      return { message: "Orçamento excluído.", link: "/finance/budget" };
    }

    case "budget_replicate": {
      const from = texto(payload, "from_month");
      const until = texto(payload, "until_month");
      const mode = texto(payload, "mode") === "replace" ? "replace" : "missing_only";
      if (!from || !until) throw new Error("A replicação chegou sem meses.");
      const meses = mesesEntre(from, until).filter((m) => m !== from);
      if (meses.length === 0) {
        throw new Error("Não há meses seguintes para replicar até a data pedida.");
      }
      await duplicateMonthlyBudgetApi(from, meses, mode);
      return {
        message: `Orçamento replicado para ${meses.length} mês(es).`,
        link: "/finance/budget",
      };
    }

    case "recurring_payment": {
      const recurringId = texto(payload, "recurring_id") ?? String(payload.recurring_id ?? "");
      const parcela = numero(payload, "installment_number");
      if (!recurringId || parcela === null) {
        throw new Error("O pagamento chegou incompleto.");
      }
      const lista = await fetchRecurringTransactions(null, null, { includeInactive: true });
      const encontrada = lista.find((item) => item.id === recurringId);
      if (!encontrada) throw new Error("Não achei essa recorrência para pagar.");
      await updateRecurringParcelPayment(
        recurringId,
        parcela,
        encontrada.paid_parcels ?? []
      );
      return { message: `Parcela ${parcela} registrada.`, link: "/finance/recurring" };
    }

    case "recurring_quit": {
      const recurringId = texto(payload, "recurring_id") ?? String(payload.recurring_id ?? "");
      if (!recurringId) throw new Error("A quitação chegou sem id.");
      await softDeleteRecurring(recurringId);
      return { message: "Recorrência quitada.", link: "/finance/recurring" };
    }

    case "habit_checkin": {
      const habitId = texto(payload, "habit_id") ?? String(payload.habit_id ?? "");
      const date = texto(payload, "date");
      if (!habitId || !date) throw new Error("O check-in chegou incompleto.");
      await toggleHabitLog(habitId, date, payload.completed !== false);
      return { message: "Check-in registrado.", link: "/habits" };
    }

    case "habit_create": {
      const name = texto(payload, "name");
      const frequency = texto(payload, "frequency") as HabitFrequency | null;
      const target = numero(payload, "target_per_week");
      if (!name || !frequency || target === null) {
        throw new Error("O hábito chegou incompleto.");
      }
      const habitKind = (texto(payload, "kind") as HabitKind | null) ?? "build";
      await createHabit({
        name,
        description: texto(payload, "description"),
        frequency,
        target_per_week: target,
        kind: habitKind === "avoid" ? "avoid" : "build",
        is_health: payload.is_health === true,
      });
      return {
        message: payload.is_health === true ? "Hábito de saúde criado." : "Hábito criado.",
        link: payload.is_health === true ? "/health" : "/habits",
      };
    }

    case "movie_mark": {
      const statusRaw = texto(payload, "status");
      const title = texto(payload, "title");
      if (!statusRaw) throw new Error("A marcação do filme chegou incompleta.");
      const status = statusRaw as MovieStatus;
      const isNew = payload.is_new === true;
      let imdbId = texto(payload, "imdb_id") ?? String(payload.imdb_id ?? "");
      const year = numero(payload, "year");
      const rating = numero(payload, "rating");
      const notes = texto(payload, "notes");
      const watchedDate = texto(payload, "watched_date");

      if (!imdbId && (isNew || title)) {
        if (!title) throw new Error("Falta o título do filme para buscar no catálogo.");
        const found = await findMovieByTitleYear(title, year);
        if (!found) {
          throw new Error(
            `Não achei “${title}” no catálogo. Tente o nome completo${year ? "" : " ou o ano"}.`
          );
        }
        imdbId = found.imdb_id;
        const dates =
          watchedDate && status === MovieStatus.WATCHED ? [watchedDate] : [];
        await upsertMovie({
          ...found,
          status,
          rating: rating ?? found.rating ?? null,
          notes: notes ?? found.notes ?? null,
          watched_dates: dates,
          would_recommend: found.would_recommend ?? true,
        });
        return {
          message:
            status === MovieStatus.TO_WATCH
              ? "Filme/série adicionado à lista."
              : "Filme/série adicionado e atualizado.",
          link: "/movies",
        };
      }

      if (!imdbId) throw new Error("A marcação do filme chegou incompleta.");
      const existing = await fetchMovieById(imdbId);
      if (!existing) {
        // Estava na proposta como existente, mas sumiu — tenta catálogo pelo título.
        if (title) {
          const found = await findMovieByTitleYear(title, year);
          if (found) {
            await upsertMovie({
              ...found,
              status,
              rating: rating ?? null,
              notes: notes ?? null,
              watched_dates:
                watchedDate && status === MovieStatus.WATCHED ? [watchedDate] : [],
            });
            return { message: "Filme/série adicionado à lista.", link: "/movies" };
          }
        }
        throw new Error("Não achei esse filme/série na sua lista.");
      }
      const dates = Array.isArray(existing.watched_dates)
        ? existing.watched_dates.map((d) =>
            typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)
          )
        : [];
      if (watchedDate && !dates.includes(watchedDate)) dates.push(watchedDate);
      await updateMovie({
        imdb_id: imdbId,
        status,
        rating: rating ?? existing.rating,
        notes: notes ?? existing.notes,
        watched_dates: dates,
      });
      return { message: "Filme/série atualizado.", link: "/movies" };
    }

    case "book_progress": {
      const title = texto(payload, "title");
      const isNew = payload.is_new === true;
      let googleId = texto(payload, "google_id") ?? String(payload.google_id ?? "");
      const status = (texto(payload, "status") as BookStatus | null) ?? undefined;
      const page = numero(payload, "current_page");
      const rating = numero(payload, "rating");
      const notes = texto(payload, "notes");

      if (isNew || !googleId) {
        if (!title) throw new Error("Falta o título do livro para buscar no catálogo.");
        const hits = await searchGoogleBooks(title);
        if (!hits.length) {
          throw new Error(`Não achei “${title}” no Google Books. Tente o nome completo.`);
        }
        const normalized = title.trim().toLowerCase();
        const exact = hits.find((h) => h.title.toLowerCase() === normalized);
        const pick = exact ?? hits[0];
        const full = (await fetchGoogleBookById(pick.google_id)) ?? {
          google_id: pick.google_id,
          title: pick.title,
          authors: pick.authors,
          published_year: pick.published_year,
          cover_url: pick.cover_url,
          categories: [],
          description: pick.description ?? null,
          page_count: null,
          publisher: null,
          isbn13: null,
          status: "to_read" as BookStatus,
          current_page: null,
          rating: null,
          notes: null,
          would_recommend: true,
          is_favorite: false,
          read_dates: [] as string[],
          score_google: null,
        };
        googleId = full.google_id;
        const finalStatus = status ?? "to_read";
        const today = new Date().toISOString().slice(0, 10);
        await createBook({
          ...full,
          status: finalStatus,
          current_page: page ?? (finalStatus === "reading" ? full.current_page : null),
          rating: rating ?? full.rating ?? null,
          notes: notes ?? full.notes ?? null,
          read_dates: finalStatus === "read" ? [today] : [],
          would_recommend: full.would_recommend ?? true,
          is_favorite: full.is_favorite === true,
        });
        return {
          message:
            finalStatus === "to_read"
              ? "Livro adicionado à estante."
              : "Livro adicionado e atualizado.",
          link: "/books",
        };
      }

      const existing = await fetchBookById(googleId);
      if (!existing) throw new Error("Não achei esse livro na sua estante.");
      const patch: Parameters<typeof updateBook>[0] = { google_id: googleId };
      if (status) patch.status = status;
      if (page !== null) patch.current_page = page;
      if (rating !== null) patch.rating = rating;
      if (notes) patch.notes = notes;
      if (status === "read") {
        const today = new Date().toISOString().slice(0, 10);
        const dates = [...(existing.read_dates ?? [])];
        if (!dates.includes(today)) dates.push(today);
        patch.read_dates = dates;
      }
      await updateBook(patch);
      return { message: "Livro atualizado.", link: "/books" };
    }

    case "series_episode": {
      const title = texto(payload, "title");
      const season = numero(payload, "season");
      const episode = numero(payload, "episode");
      if (!title || season === null || episode === null) {
        throw new Error("O episódio chegou incompleto.");
      }
      const isNew = payload.is_new === true;
      let imdbId = texto(payload, "imdb_id") ?? String(payload.imdb_id ?? "");
      const year = numero(payload, "year");
      const episodeName = texto(payload, "episode_name");
      const rating = numero(payload, "rating");
      const notes = texto(payload, "notes");

      if (!imdbId && (isNew || title)) {
        const found = await findSeriesByTitleYear(title, year);
        if (!found) {
          throw new Error(
            `Não achei a série “${title}” no catálogo. Tente o nome completo${year ? "" : " ou o ano"}.`
          );
        }
        imdbId = found.imdb_id;
        await upsertMovie({
          ...found,
          type: "series",
          status: MovieStatus.WATCHING,
          following: true,
        });
      }

      if (!imdbId) {
        const existing = title ? await findSeriesByTitleYear(title, year) : null;
        if (existing) {
          imdbId = existing.imdb_id;
        }
      }
      if (!imdbId) throw new Error("Não achei essa série na sua lista.");

      const listed = await fetchMovieById(imdbId);
      if (!listed) {
        const found = await findSeriesByTitleYear(title, year);
        if (!found) throw new Error("Não achei essa série no catálogo.");
        await upsertMovie({
          ...found,
          type: "series",
          status: MovieStatus.WATCHING,
          following: true,
        });
        imdbId = found.imdb_id;
      }

      await markEpisodeWatched({
        imdbId,
        season,
        episode,
        episodeName,
        rating,
        notes,
      });
      return {
        message: `Episódio S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")} marcado.`,
        link: "/movies",
      };
    }

    case "medication_create": {
      const name = texto(payload, "name");
      const timesRaw = texto(payload, "times");
      const startedOn = texto(payload, "started_on");
      if (!name || !timesRaw || !startedOn) {
        throw new Error("A medicação chegou incompleta.");
      }
      const times = timesRaw
        .split(/[,;/]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (times.length === 0) throw new Error("A medicação chegou sem horários.");
      await createMedicationWithDoses({
        name,
        times,
        dose_amount: numero(payload, "dose_amount"),
        dose_unit: texto(payload, "dose_unit"),
        instructions: texto(payload, "instructions"),
        interval_days: numero(payload, "interval_days") ?? 1,
        started_on: startedOn,
        ended_on: null,
      });
      return { message: "Medicação criada.", link: "/health" };
    }

    case "consultation_create": {
      const title = texto(payload, "title");
      const dueDate = texto(payload, "due_date");
      if (!title || !dueDate) throw new Error("A consulta chegou incompleta.");
      const dueTime = texto(payload, "due_time");
      await createTask({
        ...emptyTask(),
        title,
        description: texto(payload, "description"),
        status: "todo",
        due_date: dueDate,
        due_time: dueTime,
        is_consultation: true,
      });
      return { message: "Consulta agendada.", link: "/health" };
    }

    case "vehicle_create": {
      const brand = texto(payload, "brand");
      const model = texto(payload, "model");
      const kindRaw = texto(payload, "kind");
      const km = numero(payload, "current_km");
      if (!brand || !model || km === null) {
        throw new Error("O veículo chegou incompleto.");
      }
      const kind: VehicleKind = kindRaw === "motorcycle" ? "motorcycle" : "car";
      await createVehicle({
        brand,
        model,
        kind,
        current_km: km,
        plate: texto(payload, "plate"),
        year: numero(payload, "year"),
        notes: texto(payload, "notes"),
      });
      return { message: "Veículo adicionado.", link: "/car" };
    }

    case "album_wishlist": {
      const mbId = texto(payload, "musicbrainz_id") ?? String(payload.musicbrainz_id ?? "");
      const title = texto(payload, "title") ?? "Álbum";
      if (!mbId) throw new Error("O álbum chegou sem id.");
      const artistsRaw = texto(payload, "artists") ?? "";
      const artists = artistsRaw
        ? artistsRaw.split(",").map((a) => a.trim()).filter(Boolean)
        : [];
      if (payload.is_new === true) {
        await createAlbum({
          musicbrainz_id: mbId,
          title,
          artists,
          album_type: "album",
          source: "manual",
          status: "to_listen",
          listened_dates: [],
        });
        return { message: "Álbum adicionado à lista.", link: "/music" };
      }
      await updateAlbum({
        musicbrainz_id: mbId,
        status: (texto(payload, "status") as AlbumStatus | null) ?? "to_listen",
      });
      return { message: "Álbum atualizado.", link: "/music" };
    }

    case "place_visit": {
      const placeId = texto(payload, "place_visit_id") ??
        (typeof payload.place_visit_id === "string" || typeof payload.place_visit_id === "number"
          ? String(payload.place_visit_id)
          : null);
      const visitedDate = texto(payload, "visited_date");
      if (!visitedDate) throw new Error("A visita chegou sem data.");
      if (placeId) {
        await createPlaceVisitOccurrence({
          place_visit_id: placeId,
          visited_date: visitedDate,
          rating: numero(payload, "rating"),
          notes: texto(payload, "notes"),
          amount: numero(payload, "amount"),
          // Mesmo default da coluna (`not null default true`): quem registra uma visita pelo Orb
          // não disse que não recomendaria, e inventar `false` mudaria a estatística de Lugares.
          would_recommend: true,
        });
        return { message: "Visita registrada.", link: "/places" };
      }
      const name = texto(payload, "name");
      if (!name) throw new Error("A visita chegou sem nome do lugar.");
      const type = (texto(payload, "type") as PlaceType | null) ?? "other";
      await createPlace({
        name,
        type,
        status: "visited",
        visited_date: visitedDate,
        rating: numero(payload, "rating"),
        notes: texto(payload, "notes"),
        amount: numero(payload, "amount"),
        would_recommend: true,
      });
      return { message: "Lugar e visita cadastrados.", link: "/places" };
    }

    case "goal_update": {
      const goalId = texto(payload, "goal_id") ?? String(payload.goal_id ?? "");
      if (!goalId) throw new Error("A meta chegou sem id.");
      const add = numero(payload, "add_value");
      const absolute = numero(payload, "current_value");
      if (add !== null) {
        const goals = await fetchGoals();
        const goal = goals.find((g) => g.id === goalId);
        if (!goal) throw new Error("Não achei essa meta.");
        const next = Math.min(
          goal.target_value,
          Math.max(0, Number(goal.current_value) + add)
        );
        await updateGoal({ id: goalId, current_value: next });
      } else if (absolute !== null) {
        await updateGoal({ id: goalId, current_value: absolute });
      } else {
        throw new Error("A meta chegou sem valor novo nem aporte.");
      }
      return { message: "Meta atualizada.", link: "/goals" };
    }

    case "fuel_log": {
      const vehicleId = texto(payload, "vehicle_id") ?? String(payload.vehicle_id ?? "");
      const date = texto(payload, "date");
      const liters = numero(payload, "liters");
      const totalCost = numero(payload, "total_cost");
      const km = numero(payload, "km");
      if (!vehicleId || !date || liters === null || totalCost === null || km === null) {
        throw new Error("O abastecimento chegou incompleto.");
      }
      await createFuelLog({
        vehicle_id: vehicleId,
        date,
        liters,
        total_cost: totalCost,
        km,
        station: texto(payload, "station"),
        notes: texto(payload, "notes"),
      });
      return { message: "Abastecimento registrado.", link: "/car" };
    }

    case "maintenance": {
      const vehicleId = texto(payload, "vehicle_id") ?? String(payload.vehicle_id ?? "");
      const type = (texto(payload, "type") as MaintenanceType | null) ?? "other";
      const serviceDate = texto(payload, "service_date");
      const km = numero(payload, "km_at_service");
      if (!vehicleId || !serviceDate || km === null) {
        throw new Error("A manutenção chegou incompleta.");
      }
      await createMaintenance({
        vehicle_id: vehicleId,
        type,
        custom_type: texto(payload, "custom_type"),
        service_date: serviceDate,
        km_at_service: km,
        cost: numero(payload, "cost"),
        shop: texto(payload, "shop"),
        notes: texto(payload, "notes"),
      });
      return { message: "Manutenção registrada.", link: "/car" };
    }

    case "trip": {
      const title = texto(payload, "title");
      const start = texto(payload, "start_date");
      const end = texto(payload, "end_date");
      if (!title || !start || !end) throw new Error("A viagem chegou incompleta.");

      const stop1Name = texto(payload, "stop1_name") ?? texto(payload, "destination");
      const stop1Start = texto(payload, "stop1_start") ?? start;
      const stop1End = texto(payload, "stop1_end") ?? end;
      const stop2Name = texto(payload, "stop2_name");
      const stop2Start = texto(payload, "stop2_start");
      const stop2End = texto(payload, "stop2_end") ?? end;

      const stopsDraft: {
        name: string;
        start_date: string;
        end_date: string;
        sort_order: number;
        place_id: string | null;
        lat: number | null;
        lng: number | null;
      }[] = [];
      if (stop1Name && stop1Start && stop1End) {
        stopsDraft.push({
          name: stop1Name,
          start_date: stop1Start,
          end_date: stop1End,
          sort_order: 0,
          place_id: null,
          lat: null,
          lng: null,
        });
      }
      if (stop2Name && stop2Start && stop2End) {
        stopsDraft.push({
          name: stop2Name,
          start_date: stop2Start,
          end_date: stop2End,
          sort_order: 1,
          place_id: null,
          lat: null,
          lng: null,
        });
      }

      const originLabel = texto(payload, "origin_label");
      const mode = (texto(payload, "transport_mode") as TripTransportMode | null) ?? null;
      const outboundDepart = texto(payload, "outbound_depart");

      // Geocodifica origem/paradas para rota e para o formulário deixar de pedir coordenadas.
      const resolvedOrigin = originLabel ? await resolverRegiao(originLabel) : null;
      const resolvedStops = await Promise.all(
        stopsDraft.map(async (s) => {
          const place = await resolverRegiao(s.name);
          return {
            ...s,
            name: place.label || s.name,
            place_id: place.place_id,
            lat: place.lat,
            lng: place.lng,
          };
        })
      );

      const trip = await createTrip({
        title,
        start_date: start,
        end_date: end,
        destination: texto(payload, "destination"),
        budget: numero(payload, "budget"),
        status: "planning",
        notes: texto(payload, "notes"),
        origin_label: resolvedOrigin?.label ?? originLabel,
        origin_lat: resolvedOrigin?.lat ?? null,
        origin_lng: resolvedOrigin?.lng ?? null,
        stops: resolvedStops.length > 0 ? resolvedStops : undefined,
      });

      const placeByLabel = new Map<string, ResolvedPlace>();
      if (resolvedOrigin) {
        placeByLabel.set(resolvedOrigin.label.toLowerCase(), resolvedOrigin);
        if (originLabel) placeByLabel.set(originLabel.toLowerCase(), resolvedOrigin);
      }
      for (const s of resolvedStops) {
        placeByLabel.set(s.name.toLowerCase(), {
          label: s.name,
          lat: s.lat,
          lng: s.lng,
          place_id: s.place_id,
        });
      }

      const legs = listOrbTripTransfers({
        originLabel: resolvedOrigin?.label ?? originLabel,
        outboundDepart,
        interStopDepart: "08:00",
        stops: resolvedStops,
      });

      if (legs.length > 0) {
        const days = await fetchTripItineraryLite(trip.id);
        const dayByDate = new Map(
          days
            .filter((d) => d.date)
            .map((d) => [d.date!.slice(0, 10), d] as const)
        );

        for (const leg of legs) {
          const day = dayByDate.get(leg.dayDate);
          if (!day) continue;

          const fromPlace =
            placeByLabel.get(leg.originLabel.toLowerCase()) ??
            ({
              label: leg.originLabel,
              lat: null,
              lng: null,
              place_id: null,
            } satisfies ResolvedPlace);
          const toPlace =
            placeByLabel.get(leg.destinationLabel.toLowerCase()) ??
            ({
              label: leg.destinationLabel,
              lat: null,
              lng: null,
              place_id: null,
            } satisfies ResolvedPlace);

          const duration =
            mode != null
              ? await duracaoTrechoSegundos(fromPlace, toPlace, mode)
              : null;
          const times = resolveTransferTimes({
            departHint: leg.departHint,
            arriveHint: leg.arriveHint,
            durationSeconds: duration,
            defaultDepart: leg.kind === "inter" ? "08:00" : undefined,
          });

          await createItineraryActivity({
            day_id: day.id,
            title: transferEndpointsTitle(leg.originLabel, leg.destinationLabel),
            category: "transport",
            transport_mode: mode ?? undefined,
            sort_order: leg.kind === "return" ? 1 : 0,
            activity_time: times.activity_time,
            arrival_time: times.arrival_time,
            origin_label: fromPlace.label,
            origin_lat: fromPlace.lat,
            origin_lng: fromPlace.lng,
            origin_place_id: fromPlace.place_id,
            destination_label: toPlace.label,
            destination_lat: toPlace.lat,
            destination_lng: toPlace.lng,
            destination_place_id: toPlace.place_id,
            visit_status: "pending",
          });
        }
      }

      return { message: "Viagem criada.", link: `/travel/${trip.id}` };
    }

    case "trip_expense": {
      const tripId = texto(payload, "trip_id") ?? String(payload.trip_id ?? "");
      const description = texto(payload, "description");
      const amount = numero(payload, "amount");
      const category = (texto(payload, "category") as TripExpenseCategory | null) ?? "other";
      const expenseDate = texto(payload, "expense_date");
      if (!tripId || !description || amount === null || !expenseDate) {
        throw new Error("O gasto de viagem chegou incompleto.");
      }
      await createTripExpense({
        trip_id: tripId,
        description,
        amount,
        category,
        expense_date: expenseDate,
        visibility: "personal",
      });
      return { message: "Gasto da viagem registrado.", link: `/travel/${tripId}` };
    }

    case "trip_activity": {
      const dayId = texto(payload, "day_id") ?? String(payload.day_id ?? "");
      const tripId = texto(payload, "trip_id") ?? String(payload.trip_id ?? "");
      const title = texto(payload, "title");
      if (!dayId || !title) throw new Error("A atividade chegou incompleta.");
      await createItineraryActivity({
        day_id: dayId,
        title,
        activity_time: texto(payload, "activity_time"),
        category: (texto(payload, "category") as TripActivityCategory | null) ?? "other",
        notes: texto(payload, "notes"),
        sort_order: numero(payload, "sort_order") ?? 0,
        visit_status: "pending",
      });
      return {
        message: "Atividade adicionada ao roteiro.",
        link: tripId ? `/travel/${tripId}` : "/travel",
      };
    }

    case "trip_day_plan": {
      let dayId = texto(payload, "day_id") ?? String(payload.day_id ?? "");
      let tripId = texto(payload, "trip_id") ?? String(payload.trip_id ?? "");
      const planDate = texto(payload, "plan_date");
      const pendingTitle = texto(payload, "pending_trip_title");
      const raw = texto(payload, "activities_json");
      if (!raw || !planDate) throw new Error("O roteiro do dia chegou incompleto.");

      // Cartão preparado antes da viagem existir: resolve título → id + dia do roteiro agora.
      if ((!tripId || !dayId) && pendingTitle) {
        const trips = await fetchTrips();
        const alvo = pendingTitle.trim().toLowerCase();
        const trip =
          trips.find((t) => t.title.trim().toLowerCase() === alvo) ??
          trips.find((t) => t.title.trim().toLowerCase().includes(alvo));
        if (!trip) {
          throw new Error(
            `Crie a viagem “${pendingTitle}” primeiro (cartão Nova viagem) e depois adicione o roteiro.`
          );
        }
        tripId = trip.id;
        const days = await fetchTripItineraryLite(trip.id);
        const day = days.find((d) => d.date?.slice(0, 10) === planDate);
        if (!day) {
          throw new Error(
            `Não achei o dia ${planDate} no roteiro de “${trip.title}”.`
          );
        }
        dayId = day.id;
      }

      if (!dayId || !tripId) throw new Error("O roteiro do dia chegou incompleto.");
      let atividades: {
        title: string;
        activity_time?: string | null;
        arrival_time?: string | null;
        category?: string;
        sort_order?: number;
      }[];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error("vazio");
        }
        atividades = parsed as typeof atividades;
      } catch {
        throw new Error("O roteiro do dia chegou inválido.");
      }
      for (const a of atividades) {
        if (!a.title?.trim()) continue;
        await createItineraryActivity({
          day_id: dayId,
          title: a.title.trim(),
          activity_time: a.activity_time ?? null,
          arrival_time: a.arrival_time ?? null,
          category: (a.category as TripActivityCategory | undefined) ?? "other",
          sort_order: a.sort_order ?? 0,
          visit_status: "pending",
        });
      }
      return {
        message: `${atividades.length} atividades adicionadas ao roteiro.`,
        link: tripId ? `/travel/${tripId}` : "/travel",
      };
    }
  }
}

/** Meses `YYYY-MM-01` de `from` até `until`, inclusivos. */
function mesesEntre(fromIso: string, untilIso: string): string[] {
  const meses: string[] = [];
  let year = Number(fromIso.slice(0, 4));
  let month = Number(fromIso.slice(5, 7));
  const endYear = Number(untilIso.slice(0, 4));
  const endMonth = Number(untilIso.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    meses.push(`${year}-${String(month).padStart(2, "0")}-01`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (meses.length > 120) break;
  }
  return meses;
}
