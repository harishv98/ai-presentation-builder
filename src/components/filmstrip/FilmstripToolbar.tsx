"use client";

import {
  addBlankSlide,
  deleteCurrentSlide,
  duplicateCurrentSlide,
  startRenamingCurrentSlide,
} from "@/lib/slides/actions";
import { useCurrentSlideId } from "@/lib/ui/useCurrentSlideId";

const buttonClass =
  "rounded px-1.5 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent";

export function FilmstripToolbar() {
  const hasSlide = useCurrentSlideId() !== null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Slides</h2>
        <button
          type="button"
          className={buttonClass}
          title="Add a blank slide after the current one"
          onClick={() => addBlankSlide("after-current")}
        >
          + New
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={buttonClass}
          disabled={!hasSlide}
          title="Duplicate the current slide"
          onClick={duplicateCurrentSlide}
        >
          Duplicate
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!hasSlide}
          title="Rename the current slide"
          onClick={startRenamingCurrentSlide}
        >
          Rename
        </button>
        <button
          type="button"
          className={`${buttonClass} text-red-600`}
          disabled={!hasSlide}
          title="Delete the current slide"
          onClick={deleteCurrentSlide}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
