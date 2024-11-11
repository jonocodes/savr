#!node_modules/.bin/tsx

import { ingest } from "./lib";
import { startServer } from "./server";
import { spawn } from "child_process"

const args = process.argv.slice(2);

const sendMessage = (percent: number | null, message: string | null) => {
  console.log({ percent, message });
};

const dataDir = process.env.SAVR_DATA
const services = process.env.SAVR_SERVICE

// TODO: look for "--browser=" argument. use "commander" package

if (args.includes('--start-server')) {
  startServer();
} else if (args.includes("--ui")) {
  console.log('starting UI')

  const url = "http://localhost:8080/savr"

  const lynxProcess = spawn('lynx', [url], {
    stdio: 'inherit'  // This attaches Lynx’s input/output to the main process
  });

  lynxProcess.on('error', (error) => {
    console.error(`Error launching Lynx: ${error.message}`);
  });

  lynxProcess.on('exit', (code) => {
    console.log(`Lynx exited with code ${code}`);
  });

} else {

  (async () => {
    await ingest(args[0], sendMessage);
  })().catch((err) => console.log("Fatal error", err));

}
