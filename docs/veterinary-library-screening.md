# Veterinary library screening standard

Policy version: `vet-relevance-v1`.

This is the inspected main policy reference. The standalone app preserves its
content rules, with bounded durable retries and independent private storage.
See [deployment.md](deployment.md) for destination processing/retention and
[migration-plan.md](migration-plan.md) for treatment of existing documents.

Only active accounts with the professional role and a verified veterinary profile can upload.
Original books, articles, research papers, case studies, and educational guides are eligible.
ISBN, publisher, peer review, a minimum page count, and English are not prerequisites.

## Approval criteria

The actual document must be readable, substantive, and primarily concerned with veterinary
education, research, animal health, animal welfare, or veterinary practice. Eligible subjects
include disease, diagnosis, treatment, prevention, surgery, nutrition, anatomy, welfare,
zoonoses, and clinical practice for any animal species. Clinical descriptions and imagery
are allowed. Supporting background, contents, and reference sections may concern other subjects.

Resumes, fiction, human-only medicine, unrelated business documents, invoices, keyword lists,
photo collections, and advertisements without substantive veterinary education do not qualify.
A veterinary cover or isolated keywords cannot qualify an otherwise unrelated document.

## Automatic checks

1. Accept PDF files up to 10 MB. Hash bytes and refuse identical reuploads, including concurrent
   submissions. This detects identical files, not all edited copies or ownership disputes.
2. Parse each PDF page in an isolated worker with a 30-second deadline and 256 MB heap limit.
   Invalid PDFs, empty documents, and embedded scripts/files are rejected. Password-protected, unreadable, and
   documents exceeding the 1,000-page processing limit cannot be approved automatically.
3. Give the original PDF to the configured Gemini model, including scanned page imagery.
   Treat document text as untrusted content, never as instructions. Evaluate the whole PDF.
4. Require a structured verdict with veterinary focus, substance, readability, complete review,
   document type, topics, and page evidence. Validate page bounds and match excerpts against
   extracted text where available. Inconsistent or unsupported approval results stay private.
   Image-only evidence depends on the model's visual interpretation.

No self-reported confidence percentage is used as a reliability threshold. The classification
can make mistakes. Approval establishes the screening result for veterinary relevance; it does
not certify clinical accuracy, authorship, or sharing rights. The uploader confirms permission.

## States and retries

- Pending/checking: private. A durable Mongo queue survives restarts and uses expiring leases
  to prevent concurrent workers from deciding the same upload.
- Approved: visible and downloadable. Existing commission rules apply only to approved files.
- Rejected: private, with a short reason visible to the uploader.
- Unverified: private after two uncertain checks. The owner can request another check after
  a one-minute cooldown, or upload a clearer corrected document.

Provider outages and malformed results leave the item pending with exponential retries, capped
at 15 minutes between attempts. They never publish or become a content rejection. Uploads and
manual rechecks share a ten-submissions-per-hour limit per professional account.

Existing documents without an approval status are private and enter the same scanner at startup.
Earnings already recorded are preserved. Rechecking never creates another document or resets
its per-user, per-document monthly commission counter. There is no admin approval path.

## Validation

Offline tests cover real PDF parsing, corrupted/signature-only PDFs, scripts, complete document
input, evidence validation, short original articles, invalid verdicts, outages, visibility,
commission protection, private owner status, duplicate races, queue leases, and retries.
Model classification should also be evaluated using a labelled corpus of original articles,
textbooks, scans, unrelated PDFs, mixed topics, multilingual content, and prompt-injection
documents. Repeat this evaluation when changing the model or policy; mocked provider tests
establish workflow correctness, not real classification accuracy.

`GEMINI_BOOK_MODEL` optionally selects the PDF classifier. Otherwise it follows
`GEMINI_MODERATION_MODEL` and uses the existing server-side `GEMINI_API_KEY`.
