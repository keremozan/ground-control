# Gmail Labels from Pipeline Classification

## Problem

After the pipeline classifies and routes emails, the emails sit in Gmail inbox with no visual organization. When reading Gmail on mobile, everything looks the same.

## Goal

Apply Gmail labels based on pipeline classification so emails are categorized in the Gmail interface.

## Label Mapping

| Character/Track | Gmail Label |
|----------------|-------------|
| proctor, VA 204, VA 315 | Teaching |
| scholar, research tracks | Research |
| clerk, admin, KAF, SUFORM | Admin |
| curator, exhibition, gallery | Art |
| coach, doctor | Personal |
| tutor | English |
| steward, calendar | Calendar |

## Implementation

In `lib/gmail-pipeline.ts` Stage 4, after executing actions, apply the label:

1. Maintain a label ID cache (label name -> Gmail label ID)
2. On first use, create the label via Gmail API if it doesn't exist (`gmail.users.labels.create`)
3. Apply label to the message via `gmail.users.messages.modify` (addLabelIds)
4. Map the routed character to a label name using the table above

## Files

- Modify: `lib/gmail-pipeline.ts` (add label application after Stage 4 actions)
- Modify: `lib/gmail.ts` (add `getOrCreateLabel` and `applyLabel` functions)

## Notes

- Labels apply to the message, not the thread. Multiple messages in a thread can have different labels.
- Only apply labels to emails that passed Stage 2 (actionable). Filtered/skipped emails stay unlabeled.
- Pipeline log should record which label was applied.
