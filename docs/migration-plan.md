# Feature-only migration plan

No export, live database connection, migration or deletion was performed.
Migration needs a separately authorized, read-only feature export and review.

## Inventory and ownership

The inspected main models use `books` and `book_download_quotas`. Books contain
Mongo ObjectId IDs and authors, metadata, createdAt, PDF Binary, optional status,
contentHash and moderation evidence/job fields. Quotas use a deterministic
`readerId:bookId:year-month` primary key, used slots, optional author/bookId/month,
earningsCentavos, paidDownloads and download records with immutable event IDs.
There is no separate payout or commission collection in this model.

Preserve book IDs, author/reader main IDs, original creation dates, descriptions,
topics, display names, monthly quota primary keys, used slots, credit totals and
download event IDs/timestamps. Do not infer identities by email or copy users,
passwords, providers, professional records, JWT secrets or sessions.

## Offline preparation

1. Back up the feature export and produce counts, checksums and a collection
   schema inventory. Keep the export outside Git and access-controlled.
2. Export only feature metadata, quota records and the corresponding PDF bytes.
   Convert Binary bytes losslessly. Retain missing statuses as explicit pending.
3. Convert author ObjectIds to their exact hex strings. Keep book ObjectIds and
   quota `_id` strings unchanged, including the unpadded Singapore month format.
4. Hash each PDF and compare stored hashes. Identify identical-byte groups
   before applying the global unique actual-hash index. Do not merge IDs with
   earnings or remove duplicate source files. Review a canonical-file/alias
   strategy for existing duplicates before import.
5. Check foreign references using a separately approved main identity export or
   capability lookup. Unknown or disabled IDs stay unpublished. No replacement
   Books identity may be created.
6. Preserve quota used counts even on records without author/earnings fields.
   The source model can contain those records. New request IDs need no historical
   synthesis. Historical download IDs and credit totals remain untouched.

## Isolated rehearsal

Import into a new, empty Books-only database and private Vercel Blob store.
Upload PDFs to immutable `quarantine/<stable-random-key>.pdf` paths with overwrite
disabled and retain the etag and actual size. There must be no public file access
and no direct object-key endpoint. Approved promotion uses reviewed bytes.

Translate each record to the destination metadata shape, preserving original
screening metadata in an export audit record. Existing approved records should
stay private during rehearsal until fresh main capability and screening checks
pass. Do not replay historical downloads or create migration commissions.
Create durable pending jobs for usable files. Missing/corrupt files stay private
with actionable reasons. Include historical unapproved files in the inventory.

Compare total books, total PDF bytes, hashes, per-author and monthly credit sums,
event counts, used slots and author references. Reconcile every difference.
Exercise listing, ownership, private files, revoked approval, local recheck,
Singapore rollover and concurrent commissions against this isolated destination.

## Cutover and rollback

Only after main's shared sign-in/capability additions pass joint tests and the
destination deployment is separately authorized, freeze main Books writes and
export a final feature delta. Use stable IDs and source event IDs for idempotent
import. Reconcile the final delta before routing main's Books launch link.

Prevent both apps from accepting downloads that credit the same book/month
ledger during cutover. Choose one writer, preserve outstanding balances and
document its activation time. Keep main PDFs and metadata read-only for rollback.
Rollback restores the previous launch link and source writer, with an audited
destination delta reconciliation. Do not delete source data or silently reset
allowances, commission history or review status.

There is no live-data migration command in this repository. Export format,
historical duplicate treatment and account deletion/export coordination require
review before such a command is created or run.
