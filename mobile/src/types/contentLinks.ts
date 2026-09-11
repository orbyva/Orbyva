export type ContentLinkType = "article" | "video" | "website";
export type ContentLinkStatus = "to_consume" | "consumed";

export interface ContentLink {
  id: string;
  user_id?: string;
  title: string;
  url: string;
  type: ContentLinkType;
  status: ContentLinkStatus;
  notes?: string | null;
  is_favorite: boolean;
  tag_ids: string[];
  consumed_at?: string | null;
  created_at?: string;
}

export type ContentLinkCreateRequest = Omit<
  ContentLink,
  "id" | "user_id" | "created_at" | "consumed_at"
>;

export type ContentLinkUpdateRequest = Partial<ContentLinkCreateRequest> & { id: string };
