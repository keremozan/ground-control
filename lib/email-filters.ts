import fs from 'fs';
import path from 'path';

const FILTERS_PATH = path.join(process.cwd(), 'data', 'email-filters.json');

type Filters = {
  newsletterPatterns: string[];
  archiveSubjectPatterns: string[];
};

function loadFilters(): Filters {
  try { return JSON.parse(fs.readFileSync(FILTERS_PATH, 'utf-8')); }
  catch { return { newsletterPatterns: [], archiveSubjectPatterns: [] }; }
}

export type FilterResult =
  | { action: 'archive'; reason: string }
  | { action: 'classify'; flags: { newContact?: boolean } };

export function quickFilter(email: {
  from: string;
  fromRaw: string;
  subject: string;
  labels: string[];
}): FilterResult {
  const { fromRaw, subject, labels } = email;
  const fromLower = fromRaw.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const filters = loadFilters();

  // Gmail category labels
  const autoArchiveLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
  if (labels.some(l => autoArchiveLabels.includes(l))) {
    return { action: 'archive', reason: `gmail category: ${labels.find(l => autoArchiveLabels.includes(l))}` };
  }

  // Newsletter/notification sender patterns
  for (const pattern of filters.newsletterPatterns) {
    if (fromLower.includes(pattern.toLowerCase())) {
      return { action: 'archive', reason: `sender matches pattern: ${pattern}` };
    }
  }

  // Subject patterns
  for (const pattern of filters.archiveSubjectPatterns) {
    if (subjectLower.includes(pattern.toLowerCase())) {
      return { action: 'archive', reason: `subject matches pattern: ${pattern}` };
    }
  }

  return { action: 'classify', flags: {} };
}
