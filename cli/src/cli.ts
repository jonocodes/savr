#!node_modules/.bin/tsx

// import { ingestUrl } from "@savr/lib/src/index";

import FileManager, { DbManager, ingestUrl } from "@savr/lib";
import { Article } from "@savr/lib/models"

// import { startServer } from "./server";
import { spawn } from "child_process"

const args = process.argv.slice(2);


const sendMessage = (percent: number | null, message: string | null) => {
  console.log({ percent, message });
};

// const dataDir = process.env.SAVR_DATA
// const services = process.env.SAVR_SERVICE

async function generateFileManager() {

  const dataDir = process.env.DATA_DIR

  if (dataDir === undefined)
    throw new Error("DATA_DIR env var not set")

  const fm = new FileManager(dataDir)

  return fm
}

const fileManager = await generateFileManager()
const dbManager = new DbManager(fileManager)


// TODO: look for "--browser=" argument. use "commander" package

if (args.includes('--start-server')) {
  // startServer();
} else if (args.includes("--ui")) {
  console.log('starting UI')

  const url = "http://localhost:8080/savr"

  // SAVR_DATA=/home/...
  // SAVR_SERVICE=http://localhost...
  // browsh # headless firefox, shows images
  // carbonyl # headless chrome, shows images
  // lynx
  // links2

  const lynxProcess = spawn('lynx', [url], {
    stdio: 'inherit'
  });

  lynxProcess.on('error', (error) => {
    console.error(`Error launching Lynx: ${error.message}`);
  });

  lynxProcess.on('exit', (code) => {
    console.log(`Lynx exited with code ${code}`);
  });

} else {

  (async () => {
    await ingestUrl(dbManager, args[0], sendMessage);
  })().catch((err) => console.log("Fatal error", err));

}
