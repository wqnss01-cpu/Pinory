# REST API v1

Префикс всех бизнес-маршрутов: `/api/v1`. Списки принимают `cursor` и возвращают `nextCursor`. Изменяющие POST-запросы принимают `Idempotency-Key`.

- Auth: `POST /auth/telegram`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Users: `GET /users/:id`, `PATCH /users/me`, followers/following, follow/unfollow, map, entries, collections.
- Map: `GET /map/entries`, `/map/clusters`, `/map/users` с bbox, zoom, types, categories, users, collections, dates и layers.
- Places: search, nearby, detail, entries, collections, create.
- Entries: CRUD, media, unique view, wishlist-to-visited.
- Comments: list/create/update/delete/report.
- Collections: CRUD, entry ordering, follow/unfollow, add-all-to-wishlist.
- Feeds: following, nearby, global, collections.
- Search: places/users/collections/cities/countries/categories.
- Notifications: list, read one/all.
- Reports: create. Admin: users, entries, comments, reports, stats and moderation actions.

OpenAPI генерируется Fastify и доступен в `/docs`.
