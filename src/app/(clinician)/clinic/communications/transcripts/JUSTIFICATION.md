# `/clinic/communications/transcripts` — keep, don't archive (EMR-693)

**Disposition:** keep.

**Why this page exists:** every AI-summarized phone call is held in a
pending-review queue before it lands on the chart. The transcript-review page
is the single human-in-the-loop checkpoint between the call → chart-note
pipeline: it lets a clinician (a) see the redacted pertinent summary the AI
extracted, (b) inspect which PHI categories were stripped (`phone`, `address`,
`MRN`, etc.) so they know what to ask about if the summary feels thin, and
(c) approve or reject with a single click — approval auto-attaches the
summary to the patient chart, rejection drops it cleanly.

Without this surface there's no place for a clinician to review redacted
call content before it persists, which is a hard HIPAA-posture
requirement: the BAA-bound AI pipeline can extract pertinent clinical
content, but the human signs off on what becomes part of the legal medical
record. That clinician-approval gate cannot live inside the voicemail or
chat inbox — those queues are for the unredacted patient channel; this
queue is specifically for the redacted-summary review path that fans out
from phone calls and dictation, and merging it would conflate two
different signoff workflows. So: keep.

**Next-step polish (not blocking):** the page does justify itself today,
but the empty-state copy could be sharper, and the recent-decisions panel
should support an unredact/re-review action for cases where the AI stripped
something the clinician needs back. Both follow-ups go to a fresh ticket.
