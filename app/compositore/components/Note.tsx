import type { NoteDuration } from "../types";

type NoteProps = {
  duration: NoteDuration;
};

export function Note({ duration }: NoteProps) {
  const hasStem = duration !== "whole";
  const isFilled = duration !== "half" && duration !== "whole";
  const flags = duration === "eighth" ? 1 : 0;

  return (
    <svg width="40" height="80" viewBox="0 0 40 80" aria-label={`${duration} note`}>
      {/* Note head */}
      <ellipse
        cx="20"
        cy="50"
        rx="7"
        ry="5"
        fill={isFilled ? "currentColor" : "transparent"}
        stroke="currentColor"
      />

      {/* Stem */}
      {hasStem && (
        <line
          x1="26"
          y1="50"
          x2="26"
          y2="20"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}

      {/* Flag */}
      {flags === 1 && (
        <path
          d="M26 20 Q36 25 26 35"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      )}
    </svg>
  );
}
