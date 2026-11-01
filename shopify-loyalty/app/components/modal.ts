type Overlay = HTMLElement & { showOverlay?: () => void; hideOverlay?: () => void };

export function showModal(id: string) {
  (document.getElementById(id) as Overlay | null)?.showOverlay?.();
}

export function hideModal(id: string) {
  (document.getElementById(id) as Overlay | null)?.hideOverlay?.();
}
