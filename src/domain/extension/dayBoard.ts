import {
  extractContentLinkDomain,
  normalizeContentLinkUrl,
  suggestContentLinkType,
} from "@/domain/contentLinks";
import { bucketForDueDate } from "@/domain/tasks/agenda";
import type { ContentLink, ContentLinkCreateRequest, ContentLinkType } from "@/types/contentLinks";
import type { Book } from "@/types/books";
import type { Movie } from "@/types/movies";
import type { Album } from "@/types/music";
import type { NoteDraft } from "@/types/notes";
import type { PlaceVisit } from "@/types/places";
import type { ShoppingItem, ShoppingItemCreateRequest } from "@/types/shopping";
import type { Task, TaskExternalLinkDraft } from "@/types/tasks";
import type { ExtractedPage, PageKind } from "./pageContext";

export const EXT_MAX_VISIBLE_TASKS = 8;

export type DayTaskBucket = "overdue" | "today";

export type CaptureTarget = "catalog" | "shopping" | "link";

export type ExistingCapture = {
  href: string;
  label: string;
};

export function isOpenTask(task: Pick<Task, "status">): boolean {
  return task.status !== "done";
}

function isMedicationTask(task: { is_medication?: boolean | null }): boolean {
  return task.is_medication === true;
}

export function openDayTasks<
  T extends Pick<Task, "status" | "due_date"> & { is_medication?: boolean | null },
>(
  tasks: readonly T[],
  todayIso: string
): { overdue: T[]; today: T[] } {
  const overdue: T[] = [];
  const today: T[] = [];
  for (const task of tasks) {
    if (!isOpenTask(task) || isMedicationTask(task)) continue;
    const bucket = bucketForDueDate(task.due_date, todayIso);
    if (bucket === "overdue") overdue.push(task);
    else if (bucket === "today") today.push(task);
  }
  return { overdue, today };
}

export function visibleDayTasks<
  T extends Pick<Task, "status" | "due_date"> & { is_medication?: boolean | null },
>(
  tasks: readonly T[],
  todayIso: string,
  limit = EXT_MAX_VISIBLE_TASKS
): { items: Array<{ task: T; bucket: DayTaskBucket }>; hidden: number } {
  const { overdue, today } = openDayTasks(tasks, todayIso);
  const tagged: Array<{ task: T; bucket: DayTaskBucket }> = [
    ...overdue.map((task) => ({ task, bucket: "overdue" as const })),
    ...today.map((task) => ({ task, bucket: "today" as const })),
  ];
  return {
    items: tagged.slice(0, limit),
    hidden: Math.max(0, tagged.length - limit),
  };
}

export function countPendingShopping(
  items: readonly Pick<ShoppingItem, "status">[]
): number {
  return items.filter((item) => item.status === "pending").length;
}

export function countToConsumeLinks(
  links: readonly Pick<ContentLink, "status">[]
): number {
  return links.filter((link) => link.status === "to_consume").length;
}

export function captureTarget(kind: PageKind): CaptureTarget | null {
  if (kind === "movie" || kind === "book" || kind === "album" || kind === "place") {
    return "catalog";
  }
  if (kind === "product") return "shopping";
  if (kind === "unknown") return "link";
  return null;
}

export function contentLinkTypeForUrl(url: string): ContentLinkType {
  return suggestContentLinkType(url) ?? "website";
}

export function cleanPageTitle(title: string): string {
  return title
    .replace(/\s*[·|•]\s*Letterboxd.*$/i, "")
    .replace(
      /\s*[-–—]\s*(IMDb|Netflix|Prime Video|Google Maps|Tripadvisor|Booking\.com|Airbnb).*$/i,
      ""
    )
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .trim();
}

export function taskTitleFromPage(page: ExtractedPage | null): string {
  if (!page?.title) return "";
  return cleanPageTitle(page.title);
}

export function externalLinkDraftFromPage(
  page: ExtractedPage | null
): TaskExternalLinkDraft | null {
  const url = page?.url.trim();
  if (!url) return null;
  return { url, comment: null, position: 0 };
}

export function contentLinkFromPage(
  page: ExtractedPage
): ContentLinkCreateRequest {
  const url = normalizeContentLinkUrl(page.url);
  return {
    title: cleanPageTitle(page.title) || extractContentLinkDomain(url) || "Link",
    url,
    type: contentLinkTypeForUrl(url),
    status: "to_consume",
    notes: page.description,
    is_favorite: false,
    tag_ids: [],
  };
}

export function shoppingItemFromPage(
  page: ExtractedPage,
  categoryId: string | null = null
): ShoppingItemCreateRequest {
  return {
    shopping_category_id: categoryId,
    title: cleanPageTitle(page.title) || "Item",
    description: page.description,
    quantity: null,
    unit: null,
    provider_link: page.url,
    status: "pending",
  };
}

export function noteDraftFromPage(page: ExtractedPage): NoteDraft {
  const url = page.url.trim();
  const title =
    cleanPageTitle(page.title) || extractContentLinkDomain(url) || "Nota";
  const description = page.description?.trim();
  return {
    title,
    content: [url, description].filter(Boolean).join("\n\n"),
    project_id: null,
  };
}

export function normalizeCaptureUrl(url: string): string {
  try {
    const parsed = new URL(normalizeContentLinkUrl(url));
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function findExistingContentLink<T extends Pick<ContentLink, "url">>(
  links: readonly T[],
  url: string
): T | null {
  const wanted = normalizeCaptureUrl(url);
  if (!wanted) return null;
  return links.find((link) => normalizeCaptureUrl(link.url) === wanted) ?? null;
}

export function findExistingShoppingItem<
  T extends Pick<ShoppingItem, "provider_link">,
>(items: readonly T[], url: string): T | null {
  const wanted = normalizeCaptureUrl(url);
  if (!wanted) return null;
  return (
    items.find(
      (item) =>
        item.provider_link != null &&
        normalizeCaptureUrl(item.provider_link) === wanted
    ) ?? null
  );
}

function titlesMatch(left: string, right: string): boolean {
  const a = cleanPageTitle(left).toLowerCase();
  const b = cleanPageTitle(right).toLowerCase();
  return Boolean(a && b && a === b);
}

export function findExistingMovie<T extends Pick<Movie, "imdb_id" | "title">>(
  movies: readonly T[],
  page: ExtractedPage
): T | null {
  if (page.imdbId) {
    const byId = movies.find((movie) => movie.imdb_id === page.imdbId);
    if (byId) return byId;
  }
  return movies.find((movie) => titlesMatch(movie.title, page.title)) ?? null;
}

export function findExistingBook<
  T extends Pick<Book, "google_id" | "isbn13" | "title">,
>(books: readonly T[], page: ExtractedPage): T | null {
  if (page.googleBookId) {
    const byId = books.find((book) => book.google_id === page.googleBookId);
    if (byId) return byId;
  }
  if (page.isbn) {
    const isbn = page.isbn.replace(/-/g, "");
    const byIsbn = books.find(
      (book) => book.isbn13?.replace(/-/g, "") === isbn
    );
    if (byIsbn) return byIsbn;
  }
  return books.find((book) => titlesMatch(book.title, page.title)) ?? null;
}

export function findExistingAlbum<T extends Pick<Album, "title">>(
  albums: readonly T[],
  page: ExtractedPage
): T | null {
  return albums.find((album) => titlesMatch(album.title, page.title)) ?? null;
}

export function findExistingPlace<T extends Pick<PlaceVisit, "name">>(
  places: readonly T[],
  page: ExtractedPage
): T | null {
  return places.find((place) => titlesMatch(place.name, page.title)) ?? null;
}

export function existingForPage(
  target: CaptureTarget | null,
  page: ExtractedPage | null,
  bag: {
    links: readonly Pick<ContentLink, "url">[];
    shopping: readonly Pick<ShoppingItem, "provider_link">[];
  }
): ExistingCapture | null {
  if (!page || !target) return null;
  if (target === "link") {
    return findExistingContentLink(bag.links, page.url)
      ? { href: "/links", label: "Links" }
      : null;
  }
  if (target === "shopping") {
    return findExistingShoppingItem(bag.shopping, page.url)
      ? { href: "/shopping-list", label: "Lista de compras" }
      : null;
  }
  return null;
}

export function existingCatalogForKind(
  kind: PageKind,
  page: ExtractedPage,
  bag: {
    movies?: readonly Pick<Movie, "imdb_id" | "title">[];
    books?: readonly Pick<Book, "google_id" | "isbn13" | "title">[];
    albums?: readonly Pick<Album, "title">[];
    places?: readonly Pick<PlaceVisit, "name">[];
  }
): ExistingCapture | null {
  if (kind === "movie" && bag.movies && findExistingMovie(bag.movies, page)) {
    return { href: "/movies", label: "Cinema" };
  }
  if (kind === "book" && bag.books && findExistingBook(bag.books, page)) {
    return { href: "/books", label: "Livros" };
  }
  if (kind === "album" && bag.albums && findExistingAlbum(bag.albums, page)) {
    return { href: "/music", label: "Música" };
  }
  if (kind === "place" && bag.places && findExistingPlace(bag.places, page)) {
    return { href: "/places", label: "Lugares" };
  }
  return null;
}

export function nextDueMedicationDose<
  T extends Pick<Task, "status" | "due_date" | "due_time"> & {
    is_medication?: boolean | null;
  },
>(tasks: readonly T[], todayIso: string): T | null {
  const candidates = tasks.filter(
    (task) =>
      isMedicationTask(task) &&
      task.status !== "done" &&
      task.due_date != null &&
      task.due_date <= todayIso
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const byDate = (a.due_date ?? "").localeCompare(b.due_date ?? "");
    if (byDate !== 0) return byDate;
    return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
  })[0] ?? null;
}

export function medicationDoseWhen(
  task: Pick<Task, "due_date" | "due_time">,
  todayIso: string
): string {
  const time = task.due_time?.slice(0, 5);
  if (task.due_date === todayIso) return time || "hoje";
  if (task.due_date && task.due_date < todayIso) {
    return time ? `${task.due_date} · ${time}` : task.due_date;
  }
  return time || "";
}
