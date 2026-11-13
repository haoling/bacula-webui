import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { control } from "./control.js";
import { jobs } from "./jobs.js";
import { volumes } from "./volumes.js";

// 認証は前段の common-auth (forwardAuth) に任せる。アプリ自体にログインは持たない。
const app = new Hono();

app.route("/", jobs);
app.route("/", control);
app.route("/", volumes);

app.get("/healthz", (c) => c.text("ok"));

app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) });
