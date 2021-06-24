/**
 * @param  {string} key
 * @param  {string|number} data
 * @param  {number} ttl=0
 * @param  {object|null} [metadata=null]
 * @param  {string} [ttlType='expirationTtl']
 */
export const setCache = (
  key,
  data,
  ttl = 0,
  metadata = null,
  ttlType = 'expirationTtl',
) => {
  let options = {}

  if (metadata && typeof metadata === 'object') {
    options.metadata = metadata
  }

  if (ttl > 0) {
    options[ttlType] = ttl >= 60 ? ttl : 60
  }

  return KVSTORE.put(key, data, options)
}

export const getCache = async key => {
  const { value, metadata } = await KVSTORE.getWithMetadata(key)

  return { value, metadata }
}

/**
 * delete key from store
 * @param  {string} key
 */
export const deleteCache = async key => {
  return KVSTORE.delete(key)
}
