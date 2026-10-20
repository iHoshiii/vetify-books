import type { ObjectId } from 'mongodb';
import { BOOK_AFFILIATE_CENTAVOS, type BookAffiliatePage } from '../../shared/books.js';
import type { Repository } from './database.js';
import { bookMonth } from './commissions.js';
import { affiliateCharts } from './affiliate-charts.js';

export async function bookAffiliatePage(
  repo: Repository,
  author: string,
  page: number,
  now = new Date()
): Promise<BookAffiliatePage> {
  const month = bookMonth(now).key;
  const limit = 12;
  const [items, total, totals, charts] = await Promise.all([
    repo.books()
      .find({ author }, { projection: { _id: 1, title: 1 } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    repo.books().countDocuments({ author }),
    repo.quotas()
      .aggregate<{ earningsCentavos: number; monthEarningsCentavos: number; downloads: number }>([
        { $match: { author } },
        {
          $group: {
            _id: null,
            earningsCentavos: { $sum: '$earningsCentavos' },
            monthEarningsCentavos: {
              $sum: { $cond: [{ $eq: ['$month', month] }, '$earningsCentavos', 0] },
            },
            downloads: { $sum: '$paidDownloads' },
          },
        },
      ])
      .toArray(),
    affiliateCharts(repo, author, now),
  ]);
  const breakdown = await repo.quotas()
    .aggregate<{ _id: ObjectId; downloads: number; earningsCentavos: number }>([
      { $match: { author, bookId: { $in: items.map((book) => book._id) } } },
      {
        $group: {
          _id: '$bookId',
          downloads: { $sum: '$paidDownloads' },
          earningsCentavos: { $sum: '$earningsCentavos' },
        },
      },
    ])
    .toArray();
  const byBook = new Map(breakdown.map((row) => [row._id.toString(), row]));
  return {
    earningsCentavos: totals[0]?.earningsCentavos ?? 0,
    monthEarningsCentavos: totals[0]?.monthEarningsCentavos ?? 0,
    downloads: totals[0]?.downloads ?? 0,
    rateCentavos: BOOK_AFFILIATE_CENTAVOS,
    ...charts,
    items: items.map((book) => ({
      id: book._id.toString(),
      title: book.title,
      downloads: byBook.get(book._id.toString())?.downloads ?? 0,
      earningsCentavos: byBook.get(book._id.toString())?.earningsCentavos ?? 0,
    })),
    page,
    pages: Math.ceil(total / limit),
  };
}
