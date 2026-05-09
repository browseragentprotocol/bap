/**
 * bap doctor - Diagnose browser/profile readiness and first-run fallbacks
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { buildDoctorReport, formatDoctorReport } from "../doctor.js";
import { getOutputFormat, printJson } from "../output/formatter.js";
import { register } from "./registry.js";

export async function doctorCommand(
  _args: string[],
  flags: GlobalFlags,
  _client: BAPClient
): Promise<void> {
  const report = buildDoctorReport(flags);

  if (getOutputFormat() === "json") {
    printJson({ type: "doctor", ...report });
    return;
  }

  console.log(formatDoctorReport(report));
}

register("doctor", doctorCommand);
