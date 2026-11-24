// The message balance is shared by every teacher and paid to Nishchit. One short English message
// costs one credit, so the balance is also the number of short messages left. Longer messages and
// Bangla use more credits, which the composer shows before sending.

export function shortMessagesLeft(credits: number | null): number | null {
  if (credits === null) return null;
  return Math.max(0, Math.floor(credits));
}
