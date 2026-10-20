# Vetify Books: application description

Updated 14 October 2026. This document belongs to `vetify-books`. Its repository
now contains the standalone UI, API, private storage adapters and durable worker,
with isolated verification. Live sign-in still requires main's missing auth and
capability contracts. See `main-auth-contract.md` and `verification.md`.

## Purpose and users

Provide a veterinary educational document library with qualified professional
uploads, screened publication and private authorized download access.
Readers discover approved documents; professionals manage their own submissions
and see affiliate activity. This app does not own appointment booking.

## Existing behavior to preserve

- Approved document listing and metadata without leaking private/pending PDF bytes.
- Upload metadata, PDF validation, content-hash deduplication and screening states.
- Professional-owned submissions, review reasons and supported recheck behavior.
- Authenticated approved-document download and existing affiliate calculations.
- Affiliate totals, activity and professional reporting.

Current main source stores PDF bytes as MongoDB Binary and accepts up to 10 MiB.
Its earning model uses three commission slots per user/book/month, not a download
ban. Own-author downloads earn zero; eligible credit is 200 centavos.
This is tracked credit behavior, not proof of an implemented payout/payment service.
Read the actual model/tests before making policy or financial changes.

## Independent ownership

Books owns document metadata, file storage, screening/review jobs, download
allowances and commission records. Existing model collections are `books` and
`book_download_quotas`. Use immutable main user IDs for owners/readers.
It has its own database credential restricted to its selected feature database.
It does not copy main users, passwords, sessions or professional approval records.

Suggested future domain: `https://books.vetify.page`, not yet configured.
Keep its UI/API, private object storage and workers independently deployable.
Production targets Vercel Hobby with authorized private Blob transfers and daily
screening; large binary HTTP transfers bypass Vercel Functions.
Quarantine uploads until checks approve them. Persist jobs with idempotent retries,
bounded execution and clear unavailable/error outcomes.

## Accounts and professional approval

Main owns authentication, verification and provider linking. Use central
registered-client sign-in and app sessions; never receive main signing secrets.
Existing uploads require a main professional with `status=verified`, not merely
a professional role. Current main introspection does not provide that approval.
Implement the trusted capability interface and recheck sensitive writes.
Revoke access when accounts or professional approvals are disabled.

## Source and integration

Port main's `src/client/pages/books/`, professional affiliate page/components,
affiliate service, `src/shared/books.ts`, Books route/model and screening,
review/PDF-worker services. See this repository's `PROMPT.md` for the detailed map.
If events produce main notifications, use a narrow authenticated event API;
do not write directly to main collections or import its realtime internals.
Main keeps launch links and account authority, not this app's library or credit UI.

## Acceptance and migration

Preserve useful UI/API/PDF/screening/affiliate tests in isolated fixtures.
Test verified/unapproved upload permissions, cross-author access, invalid/large
PDFs, duplicates, quarantine, worker retries and concurrent commission credit.
Downloads must remain available after earning slots are exhausted where currently
allowed. Known object keys must not bypass download authorization.
Review a feature-only PDF/data migration with backups and stable main owner IDs.
Never infer identity from matching emails or delete source data without review.
Deploy this destination and verify shared auth before enabling main's link.

## Exclusions

Main account signup/approval, consultations, chat/calls, pet nutrition, Anatomy
and Blog content moderation are outside this repository.
