export const BOOK_TOPICS = [
  'Veterinary medicine',
  'Surgery',
  'Animal nutrition',
  'Animal anatomy',
  'Animal welfare',
  'Clinical practice',
] as const;
export const BOOK_AFFILIATE_DOWNLOAD_LIMIT = 3;
export const BOOK_MAX_BYTES = 10 * 1024 * 1024;
export const BOOK_AFFILIATE_CENTAVOS = 200;
export const BOOK_STATUSES = ['pending', 'checking', 'approved', 'rejected', 'unverified'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];
export type BookSummary = {
  id: string;
  title: string;
  description: string;
  topic: string;
  uploadedBy: string;
  size: number;
  createdAt: string;
};
export type BookUploadSummary = BookSummary & {
  status: BookStatus;
  reason: string | null;
};
export type BookAffiliatePage = {
  earningsCentavos: number;
  monthEarningsCentavos: number;
  downloads: number;
  rateCentavos: number;
  daily: { date: string; earningsCentavos: number; downloads: number }[];
  topBooks: { id: string; title: string; downloads: number; earningsCentavos: number }[];
  items: { id: string; title: string; downloads: number; earningsCentavos: number }[];
  page: number;
  pages: number;
};
