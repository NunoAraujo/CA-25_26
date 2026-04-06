import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

export const redis =
  globalForRedis.redis ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
