/** Atualização PWA: recarrega na hora, exceto se o usuário está em formulário. */

type ApplyFn = () => void;

let applyFn: ApplyFn | null = null;
let pending = false;
let watching = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function isFormField(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    const type = (el as HTMLInputElement).type;
    if (type === "hidden" || type === "submit" || type === "button") return false;
    return true;
  }
  if (el.isContentEditable) return true;
  const role = el.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

/** Foco em campo ou dialog/sheet aberto com campos de formulário. */
export function isEditingForm(): boolean {
  if (isFormField(document.activeElement)) return true;

  const open = document.querySelectorAll(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
  );
  for (const node of open) {
    if (
      node.querySelector(
        'form, input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [contenteditable="true"]'
      )
    ) {
      return true;
    }
  }
  return false;
}

function startWatchFormExit() {
  if (watching) return;
  watching = true;

  const tick = () => {
    if (!pending) {
      watching = false;
      return;
    }
    if (!isEditingForm()) {
      watching = false;
      applyPendingUpdate();
      return;
    }
    window.setTimeout(tick, 800);
  };
  window.setTimeout(tick, 800);
}

export function handleNeedRefresh(apply: ApplyFn) {
  applyFn = apply;
  if (isEditingForm()) {
    pending = true;
    notify();
    startWatchFormExit();
    return;
  }
  apply();
}

export function applyPendingUpdate() {
  pending = false;
  notify();
  applyFn?.();
}

export function isPwaUpdatePending() {
  return pending;
}

export function subscribePwaUpdate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
