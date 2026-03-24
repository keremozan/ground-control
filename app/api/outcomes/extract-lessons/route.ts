export const runtime = 'nodejs';
import { extractLessons, extractAllLessons } from '@/lib/lesson-extractor';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

/** POST: trigger lesson extraction. Body: { character?: string } */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { character?: string };

    if (body.character) {
      const lessons = await extractLessons(body.character);
      return apiOk({ character: body.character, lessons });
    }

    const results = await extractAllLessons();
    return apiOk({ results });
  } catch (err) {
    captureError('outcomes/extract-lessons', err);
    return apiError(500, String(err));
  }
}
