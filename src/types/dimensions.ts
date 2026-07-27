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

export interface Dimension {
  id: number;
  name: string;
  types: {
    id: number;
    name: string;
    classes: {
      id: number;
      name: string;
    }[];
  }[];
}
