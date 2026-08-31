/**
 * All valid portfolio template slugs.
 * Add a new slug here whenever a new frontend template is built —
 * this is the single source of truth the schema validates against.
 */
export const PORTFOLIO_TEMPLATE_SLUGS = [
  'classic',
  'modern',
  'minimal',
  'editorial',
  'terminal',
  'brutalist',
  'gallery',
  'timeline',
  'corporate',
  'playful',
  'newspaper',
  'postcard',
  'zine',
  'blueprint',
  'neon',
  'floating',
  'aurora',
  'cartoon',
  'retroboot',
  'novba',
  'desktopos',
  'ember',
  'nebula',
  'lens',
  'reel',
  'atelier',
  'notebook',
  'arcade',
  'atlas',
  'sticky-wall',
] as const;

export type PortfolioTemplateSlug = (typeof PORTFOLIO_TEMPLATE_SLUGS)[number];

export const DEFAULT_PORTFOLIO_TEMPLATE: PortfolioTemplateSlug = 'classic';
