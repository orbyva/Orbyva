export interface Nature {
  id: number;
  name: string;
}

export interface Type {
  id: number;
  user_id?: string;
  name: string;
  nature: Nature;
  hex_color: string | null;
  lucide_icon: string | null;
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
