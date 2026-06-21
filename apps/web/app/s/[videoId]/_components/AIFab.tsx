"use client";

import "./ai-chat.css";
import { useEffect, useRef } from "react";

interface AIFabProps {
  onClick: () => void;
  isOpen?: boolean;
}

export function AIFab({ onClick, isOpen }: AIFabProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        btnRef.current?.classList.add("input-focused");
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const target = e.relatedTarget as HTMLElement | null;
      if (
        !target ||
        (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")
      ) {
        btnRef.current?.classList.remove("input-focused");
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      className={`ai-fab${isOpen ? " is-open" : ""}`}
      onClick={onClick}
      aria-label={isOpen ? "Close AI assistant" : "Ask AI about this meeting"}
    >
      {isOpen ? (
        <svg
          className="orb"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      ) : (
        <svg
          className="orb"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v2M12 19v2M5 12H3M21 12h-2" />
          <path
            d="M12 7.5 13.2 11l3.3 1-3.3 1L12 16.5 10.8 13l-3.3-1 3.3-1z"
            fill="currentColor"
            stroke="none"
          />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
