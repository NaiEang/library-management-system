export const BOOK_ITEM_TYPES = ['book', 'limited_edition', 'research_paper'] as const;

export type BookItemType = (typeof BOOK_ITEM_TYPES)[number];

