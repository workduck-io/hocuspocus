// @ts-ignore
import { createClient } from 'redis'
import { redisConnectionSettings } from './redisConnectionSettings'

export const flushRedis = async () => {
  const client = createClient({
    url: `redis://${redisConnectionSettings.host}:${redisConnectionSettings.port}`,
  })

  await client.connect()

  return client.flushDb()
}
