# koa-object-router

A router for koa that can optionally be loaded from the filesystem.

## Setup

`npm i koa-object-router`

## Usage

```js
const Koa = require("koa");
const { router } = require("koa-object-router");

const app = new Koa();
app.use(
  router({
    /* config */
  })
);
```

### Config

At least `routesDirectory` or `routers` should be specified.

```ts
interface RouterConfig {
  // Absolute path to a directory where route files are located
  routesDirectory?: string;
  // Object containting routers and routes
  routers?: Record<string, { options?: RouterOptions; routes: RouterRoutes }>;
  // If no route is specified, pass control to the next piece of koa middleware (default false)
  passThrough?: boolean;
  // Prefixes all routes with the specified string
  prefix?: string;
  // Exclude router files that match the specified regex
  excludeRegexString?: string;
  // Specifies which router is used as the index (defaults to "index")
  index?: string;
  // A function to be called any time a non 4xx HTTP error is thrown from a route
  errorHandler?: (error: unknown) => void;
}
```

### Router Options

These options can be associated with a router and applied to all routes within the router.

```ts
interface RouterOptions {
  // Middleware to be run before each route in the router
  middleware?: MiddlewareHandler[];
  // Prefixes all routes within the router with the specified string
  prefix?: string;
  // A number dictating the priority of this router if it has conflicting routes with another router. Lower routers have higher priority.
  priority?: number;
}
```

## Examples

### Load routes from an object.

> server.js

```js
const Koa = require("koa");
const { resolve } = require("path");
const { router } = require("koa-object-router");

const app = new Koa();
app.use(bodyParser());
app.use(
  router({
    routers: {
      index: {
        routes: { "GET /": () => "results from your index route" },
      },
      users: {
        routes: {
          "GET /": async () => {
            return [
              // users
            ];
          },
          "POST /": async (ctx) => {
            const user = await User.create(ctx.body);
            return user;
          },
        },
      },
    },
  })
);
app.listen(3000);
```

### Load routes from the filesystem.

In this example the filesystem should look something like the tree below.

```
.
└── src/
    ├── server.js
    └── routes/
        ├── index.js
        └── users.js
```

> server.js

```js
const Koa = require("koa");
const { resolve } = require("path");
const { router } = require("koa-object-router");

const app = new Koa();
app.use(bodyParser());
app.use(
  router({
    routesDirectory: resolve(__dirname, "routes"),
  })
);
app.listen(3000);
```

> routes/index.js

```js
exports.routes = {
  "GET /": () => "results from your index route",
};
```

### Options
