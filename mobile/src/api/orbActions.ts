/**
 * Executa uma proposta da Orb no mobile — grava pelas mesmas APIs dos formulários nativos.
 */

import { createAlbum, updateAlbum } from "@/api/music/albums";
import { createBook, fetchBookById, updateBook } from "@/api/books/books";
import {
  fetchBookCatalogDetails,
  searchBookCatalog,
} from "@/api/books/catalog";
import {
  createFuelLog,
  createMaintenance,
  createVehicle,
} from "@/api/car/car";
import {
  createMonthlyBudgetApi,
  deleteMonthlyBudgetApi,
  duplicateMonthlyBudgetApi,
} from "@/api/finance/budget";
import { createClassApi, createTypeApi } from "@/api/finance/dimensions";
import {
  createRecurringApi,
  fetchRecurringTransactions,
  softDeleteRecurring,
  updateRecurringParcelPayment,
} from "@/api/finance/recurring";
import { createTransaction } from "@/api/finance/transactions";
import { fetchGoals, updateGoalProgress } from "@/api/goals/goals";
import { createHabit, toggleHabitLog } from "@/api/habits/habits";
import {
  createConsultation,
  createMedicationWithDoses,
} from "@/api/health/health";
import {
  fetchCinemaDetails,
  searchCinemaCatalog,
} from "@/api/movies/catalog";
import { markEpisodeWatched } from "@/api/movies/episodes";
import {
  createMovie,
  fetchMovieById,
  updateMovie,
} from "@/api/movies/movies";
import { createNoteApi } from "@/api/notes/notes";
import {
  createPlace,
  createPlaceVisitOccurrence,
} from "@/api/places/places";
import { createShoppingItemApi } from "@/api/shopping/items";
import { createProjectEventApi } from "@/api/tasks/events";
import { createProjectApi } from "@/api/tasks/projects";
import { createTaskApi } from "@/api/tasks/tasks";
import {
  createItineraryActivity,
  createTrip,
  createTripExpense,
  fetchTripItinerary,
  fetchTrips,
} from "@/api/travel/travel";
import type { AlbumStatus } from "@/types/music";
import type { BookStatus } from "@/types/books";
import type { MaintenanceType, VehicleKind } from "@/types/car";
import type { TransactionCreateRequest } from "@/types/finance";
import type { HabitFrequency, HabitKind } from "@/types/habits";
import { MovieStatus } from "@/types/movies";
import type { PlaceType } from "@/types/places";
import type { TripActivityCategory, TripExpenseCategory } from "@/types/travel";
import {
  sanitizeOrbProposalPayload,
  type OrbProposal,
} from "@/domain/orb/actionsContract";

export interface OrbProposalOutcome {
  message: string;
  link?: string;
}

const SO_WEB = "Esse tipo de criação ainda só funciona no web.";

function texto(payload: Record<string, unknown>, chave: string): string | null {
  const valor = payload[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function numero(payload: Record<string, unknown>, chave: string): number | null {
  const valor = payload[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function bool(payload: Record<string, unknown>, chave: string): boolean | null {
  const valor = payload[chave];
  return typeof valor === "boolean" ? valor : null;
}

function idTexto(payload: Record<string, unknown>, chave: string): string | null {
  return texto(payload, chave) ?? (payload[chave] != null ? String(payload[chave]) : null);
}

/** Meses inclusivos entre dois `YYYY-MM-01` (ou ISO mês). */
function mesesEntre(fromIso: string, untilIso: string): string[] {
  const from = fromIso.slice(0, 7);
  const until = untilIso.slice(0, 7);
  const [fy, fm] = from.split("-").map(Number);
  const [uy, um] = until.split("-").map(Number);
  if (!fy || !fm || !uy || !um) return [];
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < uy || (y === uy && m <= um)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function resolverFilmePorTitulo(title: string, year: number | null, series = false) {
  const hits = await searchCinemaCatalog(title);
  const filtered = hits.filter((h) =>
    series ? h.media_type === "tv" : h.media_type === "movie" || h.media_type === "tv"
  );
  const byYear =
    year != null
      ? filtered.find((h) => h.year === year) ?? filtered[0]
      : filtered[0];
  if (!byYear) return null;
  return fetchCinemaDetails(byYear);
}

export async function executeOrbProposal(
  proposal: OrbProposal
): Promise<OrbProposalOutcome> {
  const payload = sanitizeOrbProposalPayload(proposal.kind, proposal.payload);
  if (!payload) {
    throw new Error("A proposta chegou incompleta e não foi gravada.");
  }

  switch (proposal.kind) {
    case "task": {
      const titulo = texto(payload, "title") ?? "Nova tarefa";
      const tarefa = await createTaskApi({
        title: titulo,
        description: texto(payload, "description") ?? undefined,
        status: "todo",
        priority:
          (texto(payload, "priority") as "low" | "medium" | "high" | null) ?? null,
        due_date: texto(payload, "due_date"),
        due_time: texto(payload, "due_time"),
        estimated_duration: numero(payload, "estimated_duration"),
        project_id: texto(payload, "project_id"),
        parent_task_id: null,
        tag_ids: [],
      });
      return {
        message: "Tarefa criada.",
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
      const body: TransactionCreateRequest = {
        value: valor,
        class_id: Number(classId),
        description: descricao,
        transaction_at: texto(payload, "transaction_at") ?? new Date().toISOString(),
      };
      await createTransaction(body);
      return {
        message: "Lançamento criado.",
        link: `/finance/transactions?q=${encodeURIComponent(descricao)}`,
      };
    }

    case "note": {
      const nota = await createNoteApi({
        title: texto(payload, "title") ?? "Nova nota",
        content: texto(payload, "content") ?? "",
        projectId: texto(payload, "project_id"),
      });
      return { message: "Nota criada.", link: `/notes/${nota.id}` };
    }

    case "shopping_item": {
      await createShoppingItemApi({
        title: texto(payload, "title") ?? "Novo item",
        description: texto(payload, "description") ?? undefined,
        quantity: numero(payload, "quantity"),
        unit: texto(payload, "unit"),
        categoryId: texto(payload, "shopping_category_id"),
      });
      return { message: "Item adicionado à lista.", link: "/shopping" };
    }

    case "project": {
      const projeto = await createProjectApi({
        name: texto(payload, "name") ?? "Novo projeto",
        description: texto(payload, "description") ?? "",
        color: null,
      });
      return { message: "Projeto criado.", link: `/tasks/projects/${projeto.id}` };
    }

    case "event": {
      const inicio = texto(payload, "starts_at");
      const projectId = texto(payload, "project_id");
      if (!inicio) throw new Error("O evento chegou sem data de início.");
      if (!projectId) throw new Error("O evento precisa de um projeto no app.");
      await createProjectEventApi({
        projectId,
        title: texto(payload, "title") ?? "Novo evento",
        startsAt: inicio,
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
      await createRecurringApi({
        class_id: Number(classId),
        value: valor,
        description: texto(payload, "description") ?? "Recorrência",
        frequency,
        validity: texto(payload, "validity"),
        due_day: dueDay,
        installment_count: numero(payload, "installment_count"),
        payment_start_date: start,
        status: payload.status === false ? false : true,
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
      const fromKey = from.length >= 10 ? from.slice(0, 10) : `${from.slice(0, 7)}-01`;
      const untilKey = until.length >= 10 ? until.slice(0, 10) : `${until.slice(0, 7)}-01`;
      const mesesFiltrados = mesesEntre(fromKey, untilKey).filter((m) => m !== fromKey);
      if (mesesFiltrados.length === 0) {
        throw new Error("Não há meses seguintes para replicar até a data pedida.");
      }
      await duplicateMonthlyBudgetApi(fromKey, mesesFiltrados, mode);
      return {
        message: `Orçamento replicado para ${mesesFiltrados.length} mês(es).`,
        link: "/finance/budget",
      };
    }

    case "recurring_payment": {
      const recurringId = idTexto(payload, "recurring_id");
      const parcela = numero(payload, "installment_number");
      if (!recurringId || parcela === null) {
        throw new Error("O pagamento chegou incompleto.");
      }
      const lista = await fetchRecurringTransactions({ includeInactive: true });
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
      const recurringId = idTexto(payload, "recurring_id");
      if (!recurringId) throw new Error("A quitação chegou sem id.");
      await softDeleteRecurring(recurringId);
      return { message: "Recorrência quitada.", link: "/finance/recurring" };
    }

    case "habit_checkin": {
      const habitId = texto(payload, "habit_id");
      const date = texto(payload, "date");
      if (!habitId || !date) throw new Error("Check-in incompleto.");
      await toggleHabitLog(habitId, date, bool(payload, "completed") ?? true);
      return { message: "Hábito atualizado.", link: "/habits" };
    }

    case "habit_create": {
      await createHabit({
        name: texto(payload, "name") ?? "Hábito",
        frequency: (texto(payload, "frequency") as HabitFrequency) ?? "daily",
        target_per_week: numero(payload, "target_per_week") ?? 7,
        kind: (texto(payload, "kind") as HabitKind) ?? "build",
        description: texto(payload, "description") ?? "",
        is_health: bool(payload, "is_health") ?? false,
        color: null,
        goal_id: null,
        goal_increment: null,
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
      let imdbId = idTexto(payload, "imdb_id") ?? "";
      const year = numero(payload, "year");
      const rating = numero(payload, "rating");
      const notes = texto(payload, "notes");
      const watchedDate = texto(payload, "watched_date");

      if (!imdbId && (isNew || title)) {
        if (!title) throw new Error("Falta o título do filme para buscar no catálogo.");
        const found = await resolverFilmePorTitulo(title, year);
        if (!found) {
          throw new Error(
            `Não achei “${title}” no catálogo. Tente o nome completo${year ? "" : " ou o ano"}.`
          );
        }
        imdbId = found.imdb_id;
        const dates =
          watchedDate && status === MovieStatus.WATCHED ? [watchedDate] : [];
        await createMovie({
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
        if (title) {
          const found = await resolverFilmePorTitulo(title, year);
          if (found) {
            await createMovie({
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
      let googleId = idTexto(payload, "google_id") ?? "";
      const status = (texto(payload, "status") as BookStatus | null) ?? undefined;
      const page = numero(payload, "current_page");
      const rating = numero(payload, "rating");
      const notes = texto(payload, "notes");

      if (isNew || !googleId) {
        if (!title) throw new Error("Falta o título do livro para buscar no catálogo.");
        const hits = await searchBookCatalog(title);
        if (!hits.length) {
          throw new Error(`Não achei “${title}” no Google Books. Tente o nome completo.`);
        }
        const normalized = title.trim().toLowerCase();
        const exact = hits.find((h) => h.title.toLowerCase() === normalized);
        const pick = exact ?? hits[0];
        const full = (await fetchBookCatalogDetails(pick.google_id)) ?? {
          google_id: pick.google_id,
          title: pick.title,
          authors: pick.authors,
          published_year: pick.published_year,
          cover_url: pick.cover_url,
          categories: [],
          description: null,
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
      let imdbId = idTexto(payload, "imdb_id") ?? "";
      const year = numero(payload, "year");
      const episodeName = texto(payload, "episode_name");
      const rating = numero(payload, "rating");
      const notes = texto(payload, "notes");

      if (!imdbId && (isNew || title)) {
        const found = await resolverFilmePorTitulo(title, year, true);
        if (!found) {
          throw new Error(
            `Não achei a série “${title}” no catálogo. Tente o nome completo${year ? "" : " ou o ano"}.`
          );
        }
        imdbId = found.imdb_id;
        await createMovie({
          ...found,
          type: "series",
          status: MovieStatus.WATCHING,
          following: true,
        });
      }

      if (!imdbId) throw new Error("Não achei essa série na sua lista.");
      const listed = await fetchMovieById(imdbId);
      if (!listed) {
        const found = await resolverFilmePorTitulo(title, year, true);
        if (!found) throw new Error("Não achei essa série no catálogo.");
        await createMovie({
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
      await createConsultation({
        title,
        due_date: dueDate,
        due_time: texto(payload, "due_time"),
        description: texto(payload, "description") ?? undefined,
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
      return { message: "Veículo adicionado.", link: "/cars" };
    }

    case "album_wishlist": {
      const mbId = idTexto(payload, "musicbrainz_id");
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
      const placeId = idTexto(payload, "place_visit_id");
      const visitedDate = texto(payload, "visited_date");
      if (!visitedDate) throw new Error("A visita chegou sem data.");
      if (placeId) {
        await createPlaceVisitOccurrence({
          place_visit_id: placeId,
          visited_date: visitedDate,
          rating: numero(payload, "rating"),
          notes: texto(payload, "notes"),
          amount: numero(payload, "amount"),
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
      const goalId = idTexto(payload, "goal_id");
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
        await updateGoalProgress(goalId, next);
      } else if (absolute !== null) {
        await updateGoalProgress(goalId, absolute);
      } else {
        throw new Error("A meta chegou sem valor novo nem aporte.");
      }
      return { message: "Meta atualizada.", link: "/goals" };
    }

    case "fuel_log": {
      const vehicleId = idTexto(payload, "vehicle_id");
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
      });
      return { message: "Abastecimento registrado.", link: "/cars" };
    }

    case "maintenance": {
      const vehicleId = idTexto(payload, "vehicle_id");
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
      });
      return { message: "Manutenção registrada.", link: "/cars" };
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

      const stops = [];
      if (stop1Name && stop1Start && stop1End) {
        stops.push({
          name: stop1Name,
          start_date: stop1Start,
          end_date: stop1End,
          sort_order: 0,
          place_id: null as string | null,
          lat: null as number | null,
          lng: null as number | null,
        });
      }
      if (stop2Name && stop2Start && stop2End) {
        stops.push({
          name: stop2Name,
          start_date: stop2Start,
          end_date: stop2End,
          sort_order: 1,
          place_id: null,
          lat: null,
          lng: null,
        });
      }

      const trip = await createTrip({
        title,
        start_date: start,
        end_date: end,
        destination: texto(payload, "destination"),
        budget: numero(payload, "budget"),
        status: "planning",
        notes: texto(payload, "notes"),
        origin_label: texto(payload, "origin_label"),
        stops: stops.length > 0 ? stops : undefined,
      });
      return { message: "Viagem criada.", link: `/travel/${trip.id}` };
    }

    case "trip_expense": {
      const tripId = idTexto(payload, "trip_id");
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
      const dayId = idTexto(payload, "day_id");
      const tripId = idTexto(payload, "trip_id");
      const title = texto(payload, "title");
      if (!dayId || !title) throw new Error("A atividade chegou incompleta.");
      await createItineraryActivity({
        day_id: dayId,
        title,
        activity_time: texto(payload, "activity_time"),
        category: (texto(payload, "category") as TripActivityCategory | null) ?? "other",
        notes: texto(payload, "notes"),
        sort_order: numero(payload, "sort_order") ?? 0,
      });
      return {
        message: "Atividade adicionada ao roteiro.",
        link: tripId ? `/travel/${tripId}` : "/travel",
      };
    }

    case "trip_day_plan": {
      let dayId = idTexto(payload, "day_id") ?? "";
      let tripId = idTexto(payload, "trip_id") ?? "";
      const planDate = texto(payload, "plan_date");
      const pendingTitle = texto(payload, "pending_trip_title");
      const raw = texto(payload, "activities_json");
      if (!raw || !planDate) throw new Error("O roteiro do dia chegou incompleto.");

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
        const days = await fetchTripItinerary(trip.id);
        const day = days.find((d) => d.date?.slice(0, 10) === planDate);
        if (!day) {
          throw new Error(`Não achei o dia ${planDate} no roteiro de “${trip.title}”.`);
        }
        dayId = day.id;
      }

      if (!dayId || !tripId) throw new Error("O roteiro do dia chegou incompleto.");
      let atividades: {
        title: string;
        activity_time?: string | null;
        category?: string;
        sort_order?: number;
      }[];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("vazio");
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
          category: a.category ?? "other",
          sort_order: a.sort_order ?? 0,
        });
      }
      return {
        message: "Roteiro do dia adicionado.",
        link: `/travel/${tripId}`,
      };
    }

    default:
      throw new Error(SO_WEB);
  }
}
