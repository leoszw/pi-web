# Modal Centering Design

## Goal

Keep the model configuration dialog centered in the viewport regardless of the surrounding application layout.

## Design

The existing `.modal-backdrop` remains a fixed full-viewport overlay. Its alignment mechanism changes from Flexbox to CSS Grid with `place-items: center`, which centers the modal on both axes at the overlay level. The modal’s existing width, maximum height, z-index, dismissal behavior, and visual styling are unchanged.

## Verification

Run the web test suite and production build. The overlay will be visually checked at a normal desktop viewport.
