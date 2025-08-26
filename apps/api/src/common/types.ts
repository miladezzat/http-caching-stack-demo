
export type CachePolicyOptions = {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  scope?: 'public' | 'private';
  vary?: string[];
  tags?: string[];
  lastModifiedField?: string;
  etag?: 'weak' | 'strong';
};
