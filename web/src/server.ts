import Fastify from "fastify";

import path from "path";
import { join } from "path";
import { dirname } from "path";
import { FastifySSEPlugin } from "fastify-sse-v2";
import {
  ingestUrl,
  articleList,
  renderTemplate,
  setState,
  articlesToRender,
  dataDir,
  ingestText,
  toArticleAndRender,
} from "lib";
import { getArticles, renderSystemInfo } from "./backend";
// import { systemInfo } from "backend";
import * as fs from 'fs';
import staticFiles from "@fastify/static";
import { fileURLToPath } from "url";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import formbody from '@fastify/formbody';
import { version } from "../package.json" with { type: "json" };

// Get the current directory path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface IIngestQuerystring {
  url: string;
}

interface IStathChangePathstring {
  state: string;
  slug: string;
}

const server = Fastify({
  logger: true,

  bodyLimit: 30 * 1024 * 1024 // Default Limit set to 30MB
});


if (dataDir === undefined) throw new Error("DATA_DIR env var not set");

const savesDir = join(dataDir, "/saves");

const namespace: string = "/savr"; // TODO: make configurable
// const namespace = "";

await server.register(cors, {
  origin: "*",
})

server.register(formbody);

server.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
});

server.register(staticFiles, {
  root: savesDir,
  prefix: `${namespace}/saves/`,
});

server.register(staticFiles, {
  root: path.join(__dirname, "static"),
  prefix: `${namespace}/static/`,
  decorateReply: false, // the reply decorator has been added by the first plugin registration
});

server.register(FastifySSEPlugin);

server.register(
  function (app, _, done) {
    app.get<{ Params: IStathChangePathstring }>(
      "/setstate/:state/:slug",
      async (request, reply) => {
        const { state, slug } = request.params;

        // TODO: validate state and show error

        await setState(slug, state);

        reply.redirect(namespace);
        return;
      }
    );


    app.get("/about", async (request, reply) => {

      const rendered = await renderSystemInfo()
      reply.type("text/html").send(rendered);

    });

    app.get("/fsList", async (request, reply) => {

      if (dataDir === undefined)
        throw new Error("DATA_DIR env var not set")
      
      try {
        const files = fs.readdirSync(dataDir);
        reply.send(files);
      } catch (err) {
        reply.code(500).send({ error: 'Error reading directory' });
      }

    });

    app.get("/db", async (request, reply) => {

      try {
        const list = await articleList();
        // const data = fs.readFileSync("db.json", "utf8");
        // const jsonData = JSON.parse(data);
        reply.send(list);
      } catch (err) {
        reply.code(500).send({ error: 'Error reading db.json' });
      }
    });

    app.get("/api/articles", async (request, reply) => {

      try {
        const articles = getArticles();
        reply.send(articles);
      } catch (err) {
        reply.code(500).send({ error: 'Error reading db.json' });
      }
    });


    app.get("/", async (request, reply) => {
      // if url does not end with slash, redirect so it does
      //   this is only needed to help resolve a local css file

      if (!request.url.endsWith("/")) {
        reply.redirect(request.url + "/");
        return;
      }

      const articles = await articleList();

      const rootPath = namespace;

      const [readable, archived] = articlesToRender(articles);

      try {
        const rendered = renderTemplate("list", {
          readable,
          archived,
          // rootPath: rootPath,
          namespace: namespace,
          static: false,
          metadata: JSON.stringify({ ingestPlatform: version }, null, 2),
        });

        reply.type("text/html").send(rendered);
      } catch (err) {
        console.error(err);
        return "?error?";
      }
    });

    app.get<{
      Querystring: IIngestQuerystring;
    }>("/save", async (request, reply) => {
      const sendMessage = (percent: number | null, message: string | null) => {
        console.log({ percent, message });
        reply.sse({ data: JSON.stringify({ percent, message }) });
      };

      const url = request.query.url;

      if (url == undefined || url == "") {
        reply.redirect(namespace);
        return;
      }

      ingestUrl(url, sendMessage)
        .then(() => {
          // console.log("done again");
          // TODO: figure out why browser is still spinning
          //   thumbnails are generated after? I think .then is not working
          // reply.raw.end(); // Close the connection after messages are done
        })
        .catch((error) => {
          console.error(error);
          sendMessage(-1, "Error while processing. See logs.");
          // reply.raw.end(); // Close the connection if client disconnects
          // return "errOr";
        });

      // Handle client disconnect (if client closes the connection)
      request.raw.on("close", () => {
        reply.raw.end();
      });
      // reply.sse({ event: "close" });
    });


    interface SaveTextRequestBody {
      text: string;
    }

    app.get("/saveText", async (request, reply) => {

      const rendered = renderTemplate('add-text', {
        namespace: namespace,
      })

      reply.type("text/html").send(rendered)

    });

    app.post<{
      Body: SaveTextRequestBody
      // Querystring: IIngestQuerystring;
    }>("/saveText", async (request, reply) => {
      const sendMessage = (percent: number | null, message: string | null) => {
        console.log({ percent, message });
        reply.sse({ data: JSON.stringify({ percent, message }) });
      };

      const { text } = request.body

      // TODO: handle empty text

      ingestText(text, sendMessage)
        .then(() => {
          // console.log("done again");
          // TODO: figure out why browser is still spinning
          //   thumbnails are generated after? I think .then is not working
          // reply.raw.end(); // Close the connection after messages are done
        })
        .catch((error) => {
          console.error(error);
          sendMessage(-1, "Error while processing. See logs.");
          // reply.raw.end(); // Close the connection if client disconnects
          // return "errOr";
        });

      // Handle client disconnect (if client closes the connection)
      request.raw.on("close", () => {
        reply.raw.end();
      });
      // reply.sse({ event: "close" });
    });


    done();
  },
  { prefix: namespace }
);

if (namespace != "")
  server.get("/", async (request, reply) => {
    // TODO: use this endpoint for the docker healtcheck
    return "savr service";
  });

export async function startServer() {
  server.listen({ host: '0.0.0.0', port: 8080 }, (err, address) => {
    // TODO: make address configurable
    if (err) {
      server.log.error(err);
      // console.error(err);
      process.exit(1);
    }
    console.log(`Savr service running at ${address}${namespace}`);
  });
}

startServer();
