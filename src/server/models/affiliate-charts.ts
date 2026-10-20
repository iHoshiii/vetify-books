import type { ObjectId } from 'mongodb';
import type { Repository } from './database.js';

export async function affiliateCharts(repo: Repository, author: string, now: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  const singaporeOffset = 8 * 60 * 60 * 1000;
  const today = new Date(now.getTime() + singaporeOffset).toISOString().slice(0, 10);
  const firstDay = Date.parse(`${today}T00:00:00Z`) - 29 * dayMs;
  const from = new Date(firstDay - singaporeOffset);
  const [activity, ranking] = await Promise.all([
    repo.quotas()
      .aggregate<{ _id: string; earningsCentavos: number; downloads: number }>([
        { $match: { author, 'downloads.at': { $gte: from, $lte: now } } },
        { $unwind: '$downloads' },
        {
          $match: {
            'downloads.at': { $gte: from, $lte: now },
            'downloads.earningsCentavos': { $gt: 0 },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$downloads.at',
                timezone: 'Asia/Singapore',
              },
            },
            earningsCentavos: { $sum: '$downloads.earningsCentavos' },
            downloads: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    repo.quotas()
      .aggregate<{ _id: ObjectId; earningsCentavos: number; downloads: number }>([
        { $match: { author, paidDownloads: { $gt: 0 } } },
        {
          $group: {
            _id: '$bookId',
            downloads: { $sum: '$paidDownloads' },
            earningsCentavos: { $sum: '$earningsCentavos' },
          },
        },
        { $sort: { downloads: -1, earningsCentavos: -1, _id: 1 } },
        { $limit: 5 },
      ])
      .toArray(),
  ]);
  const titles = await repo.books()
    .find(
      { author, _id: { $in: ranking.map((row) => row._id) } },
      { projection: { _id: 1, title: 1 } }
    )
    .toArray();
  const titleById = new Map(titles.map((book) => [book._id.toString(), book.title]));
  const activityByDay = new Map(activity.map((row) => [row._id, row]));
  return {
    // Explicit zeroes show quiet days without inventing activity.
    daily: Array.from({ length: 30 }, (_, index) => {
      const date = new Date(firstDay + index * dayMs).toISOString().slice(0, 10);
      const row = activityByDay.get(date);
      return { date, earningsCentavos: row?.earningsCentavos ?? 0, downloads: row?.downloads ?? 0 };
    }),
    topBooks: ranking.map((row) => ({
      id: row._id.toString(),
      title: titleById.get(row._id.toString()) ?? 'Unavailable book',
      downloads: row.downloads,
      earningsCentavos: row.earningsCentavos,
    })),
  };
}

