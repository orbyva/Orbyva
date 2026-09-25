import type { FolderNav } from "@/domain/notes/folders";

/** Pasta aberta na lista — o `+` / `notes/form` lê isso no mount. */
let current: FolderNav = null;

export function setNoteFolderNav(nav: FolderNav) {
  current = nav;
}

export function getNoteFolderNav(): FolderNav {
  return current;
}
