// Verifies the current Auto Earn vault, Loop factory and swapper on the Mezo explorer.
//   npm run verify:mezo
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { verifyDeployment } from "./lib/verify-deployment.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(fs.readFileSync(path.resolve(here, "../../web/ui-config/mezoDeployment.json"), "utf8"));
await verifyDeployment(hre, deployment);
