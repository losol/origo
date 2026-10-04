---
"@eventuras/logger": patch
---

Errors logged under `error` keep their message and stack. Pino serialized an Error only under `err`, so `logger.error(err)` and `logger.error({ error })` wrote `"error":{}`; the Pino transport now serializes `error` the same way.
