/** Jeda sebelum percobaan ulang permintaan ke gateway SIGA. */
export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}
