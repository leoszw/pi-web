export interface RateLimitDecision {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

interface Bucket {
  count: number
  resetAt: number
}

export class InMemoryRateLimiter {
  readonly #buckets = new Map<string, Bucket>()
  readonly #windowMs: number
  readonly #readLimit: number
  readonly #writeLimit: number
  readonly #maxBuckets: number

  constructor(options: { windowMs?: number; readLimit?: number; writeLimit?: number; maxBuckets?: number } = {}) {
    this.#windowMs = options.windowMs ?? 60_000
    this.#readLimit = options.readLimit ?? 240
    this.#writeLimit = options.writeLimit ?? 60
    this.#maxBuckets = options.maxBuckets ?? 20_000
  }

  consume(key: string, write: boolean, now = Date.now()): RateLimitDecision {
    this.#prune(now)
    const limit = write ? this.#writeLimit : this.#readLimit
    const bucketKey = `${write ? 'w' : 'r'}\u0000${key}`
    let bucket = this.#buckets.get(bucketKey)
    if (bucket === undefined || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.#windowMs }
      this.#buckets.set(bucketKey, bucket)
    }
    bucket.count += 1
    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    }
  }

  #prune(now: number): void {
    for (const [key, bucket] of this.#buckets) if (bucket.resetAt <= now) this.#buckets.delete(key)
    if (this.#buckets.size <= this.#maxBuckets) return
    const overflow = this.#buckets.size - this.#maxBuckets
    let removed = 0
    for (const key of this.#buckets.keys()) {
      this.#buckets.delete(key)
      removed += 1
      if (removed >= overflow) break
    }
  }
}
