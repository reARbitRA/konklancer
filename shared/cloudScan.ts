// SPEC-004: an old completed scan must never count as the new request's result.
export function isFreshCloudScan(status: any, sinceIso: string): boolean {
  if (status?.phase !== 'finished') return false;
  const finished = Date.parse(status.finished_at ?? '');
  const since = Date.parse(sinceIso);
  return Number.isFinite(finished) && Number.isFinite(since) && finished >= since;
}
