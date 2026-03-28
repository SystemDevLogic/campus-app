"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function isEligibleClickTarget(target: HTMLElement, event: MouseEvent) {
  if (target.closest("[data-no-global-loader='true']")) {
    return false;
  }

  const anchorElement = target.closest("a[href]");
  if (anchorElement instanceof HTMLAnchorElement) {
    const href = anchorElement.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) {
      return false;
    }

    if (anchorElement.target === "_blank" || anchorElement.hasAttribute("download")) {
      return false;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return false;
    }

    return true;
  }

  const button = target.closest("button");
  if (button) {
    if (button.dataset.globalLoader !== "true") {
      return false;
    }

    return !button.disabled;
  }

  const inputButton = target.closest("input[type='submit'], input[type='button'], input[type='reset']");
  if (inputButton instanceof HTMLInputElement) {
    if (inputButton.dataset.globalLoader !== "true") {
      return false;
    }

    return !inputButton.disabled;
  }

  return false;
}

export default function GlobalNavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(false);
    if (hideTimeoutRef.current) {
      globalThis.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    const hideLoader = () => {
      setVisible(false);
      if (hideTimeoutRef.current) {
        globalThis.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };

    const showLoader = () => {
      setVisible(true);
      if (hideTimeoutRef.current) {
        globalThis.clearTimeout(hideTimeoutRef.current);
      }

      hideTimeoutRef.current = globalThis.setTimeout(hideLoader, 12000);
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (isEligibleClickTarget(target, event)) {
        showLoader();
      }
    };

    const handleSubmit = (event: SubmitEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) {
        return;
      }

      if (target.matches("[data-no-global-loader='true']")) {
        return;
      }

      showLoader();
    };

    const handleNavigationDone = () => {
      hideLoader();
    };

    const originalPushState = globalThis.history.pushState;
    const originalReplaceState = globalThis.history.replaceState;

    globalThis.history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      handleNavigationDone();
      return result;
    };

    globalThis.history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      handleNavigationDone();
      return result;
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    globalThis.addEventListener("popstate", handleNavigationDone);
    globalThis.addEventListener("hashchange", handleNavigationDone);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      globalThis.removeEventListener("popstate", handleNavigationDone);
      globalThis.removeEventListener("hashchange", handleNavigationDone);
      globalThis.history.pushState = originalPushState;
      globalThis.history.replaceState = originalReplaceState;
      if (hideTimeoutRef.current) {
        globalThis.clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="global-loader" role="status" aria-live="polite" aria-label="Cargando">
      <div className="global-loader__panel">
        <div className="global-loader__spinner" />
        <p className="global-loader__title">Cargando</p>
        <p className="global-loader__text">Estamos preparando tu siguiente pantalla...</p>
      </div>
    </div>
  );
}
