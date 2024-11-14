import Fastify from "fastify";

import path from "path";
import { join } from "path";
import { dirname } from "path";
import { FastifySSEPlugin } from "fastify-sse-v2";
import { ingest, articleList, renderTemplate, setState, generateInfoForCard, articlesToRender, dataDir } from "./lib";
import staticFiles from "@fastify/static";
import { fileURLToPath } from "url";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

// Get the current directory path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface IIngestQuerystring {
  url: string;
}

interface IStathChangePathstring {
  state: string,
  slug: string,
}

const server = Fastify({
  logger: true,
});

// const dataDir = process.env.SAVR_DATA || process.env.HOME + "/sync/more/savr_data";

const savesDir = join(dataDir, "/saves");

const namespace: string = "/savr"; // TODO: make configurable
// const namespace = "";

await server.register(cors, {
  origin: "*",
});

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

    app.get<{ Params: IStathChangePathstring }>("/setstate/:state/:slug", async (request, reply) => {

      const { state, slug } = request.params;

      // TODO: validate state and show error

      await setState(slug, state)

      reply.redirect(namespace);
      return;
    });

    app.get("/", async (request, reply) => {

      // if url does not end with slash, redirect so it does
      //   this is only needed to help resolve a local css file

      if (!request.url.endsWith("/")) {
        reply.redirect(request.url + "/");
        return;
      }

      const articles = await articleList();

      const rootPath = namespace

      const [readable, archived] = articlesToRender(articles)

      try {
        const rendered = renderTemplate("list", {
          readable, 
          archived,
          // rootPath: rootPath,
          namespace: namespace,
          static: false,
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

      ingest(url, sendMessage)
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
    return "savr service";
    // return reply.view("index", { dirs: dirList(), namespace });
  });


export async function startServer() {

  server.listen({ port: 8080 }, (err, address) => {
    // TODO: make address configurable
    if (err) {
      server.log.error(err);
      // console.error(err);
      process.exit(1);
    }
    console.log(`Savr service running at ${address}${namespace}`);
  });

}
