export const runtime = 'nodejs';
import { getCharacterList } from '@/lib/characters';

export function GET() {
  const characters = getCharacterList().map(c => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    color: c.color,
    defaultModel: c.defaultModel,
  }));
  return Response.json({ characters });
}
