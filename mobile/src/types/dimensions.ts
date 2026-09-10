export interface Nature {
  id: number;
  name: string;
}

export interface Type {
  id: number;
  user_id?: string;
  name: string;
  nature_id?: number;
  nature: Nature;
  hex_color: string | null;
  lucide_icon: string | null;
  order?: number;
  /** Poupança/transferência: não entra no gasto do mês nem no teto. */
  exclude_from_spend?: boolean;
}

export interface Class {
  id: number;
  user_id?: string;
  name: string;
  type_id?: number;
  type?: Type | null;
}

export interface TypeCreateRequest {
  name: string;
  nature_id: number;
  hex_color?: string | null;
  lucide_icon?: string | null;
  order?: number;
  exclude_from_spend?: boolean;
}

export interface ClassCreateRequest {
  name: string;
  type_id: number;
}

export interface ClassUpdateRequest {
  id: number;
  name?: string;
  type_id?: number;
}

export interface Dimension {
  id: number;
  name: string;
  types: {
    id: number;
    name: string;
    hex_color?: string | null;
    lucide_icon?: string | null;
    classes: {
      id: number;
      name: string;
    }[];
  }[];
}
