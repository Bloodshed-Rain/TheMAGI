export function showNotice(message: string) {
  window.dispatchEvent(new CustomEvent("magi:notice", { detail: message }));
}
