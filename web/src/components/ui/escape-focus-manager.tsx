'use client';

import { useEffect } from 'react';

const escapeOwningOverlaySelector = [
  '[role="alertdialog"]',
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="tooltip"]'
].join(', ');

function canBlur(element: Element | null): element is Element & { blur: () => void } {
  return Boolean(element && 'blur' in element && typeof element.blur === 'function');
}

export function EscapeFocusManager() {
  useEffect(() => {
    function releaseFocus(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      // React Aria overlays own the first Escape press so they can close and
      // restore focus to their trigger. A following Escape can release it.
      if (document.querySelector(escapeOwningOverlaySelector)) {
        return;
      }

      const activeElement = document.activeElement;

      if (canBlur(activeElement)) {
        activeElement.blur();
      }
    }

    document.addEventListener('keydown', releaseFocus, true);
    return () => {
      document.removeEventListener('keydown', releaseFocus, true);
    };
  }, []);

  return null;
}
