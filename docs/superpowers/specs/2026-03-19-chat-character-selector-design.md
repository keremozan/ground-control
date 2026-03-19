# Chat Character Selector Overflow

## Problem

The "+" character selector dropdown in ChatWidget renders all 16+ characters in a flat vertical list with no max-height. On smaller screens it extends past the viewport, making it hard to select characters near the bottom.

## Recommended Fix

Compact grid with max-height. Set `max-height: 280px; overflow-y: auto` on the dropdown container. Switch from vertical list to a 2-column grid of icon-only buttons (22x22 character icons with color). Character name shows as a tooltip on hover. Clicking opens a tab. Fits all characters in ~4 rows without scrolling.

## Alternative

Grouped rows. Keep the vertical list but group by category (Research, Teaching, Admin, Personal, System) with tiny section labels. Add `max-height: 280px; overflow-y: auto` for scroll.

## Files

- Modify: `components/home/ChatWidget.tsx` (lines ~1920-1968, the `showNewTabPicker` dropdown)
