import type { NoteAccidental, NoteDuration } from "../types";

type NoteProps = {
  duration: NoteDuration;
  accidental?: NoteAccidental | null;
};

export function Note({ duration, accidental = null }: NoteProps) {
  const hasStem = duration !== "whole";
  const isFilled = duration !== "half" && duration !== "whole";
  const flags = duration === "eighth" ? 1 : 0;
  const accidentalSymbol =
    accidental === "sharp" ? "\u266f" : accidental === "flat" ? "\u266d" : "";
  const ariaAccidental =
    accidental === "sharp" ? " sharp" : accidental === "flat" ? " flat" : "";

  return (
    <svg
      width="40"
      height="80"
      viewBox="0 0 40 80"
      aria-label={`${duration} note${ariaAccidental}`}
    >
      {accidentalSymbol ? (
        <text
          x="8"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="18"
          fill="currentColor"
        >
          {accidentalSymbol}
        </text>
      ) : null}
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
