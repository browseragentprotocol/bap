/**
 * bap watch — Stream live browser events to terminal
 *
 * Long-running command that subscribes to page, console, network,
 * dialog, and download events. Runs until Ctrl+C.
 *
 * Usage:
 *   bap watch                           All events
 *   bap watch --filter=console,network  Only console and network
 *   bap watch --format=json             JSON output for piping
 */

import { pc } from "@browseragentprotocol/logger";
import type { BAPClient } from "@browseragentprotocol/client";
import type {
  PageEvent,
  ConsoleEvent,
  NetworkEvent,
  DialogEvent,
  DownloadEvent,
} from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { getOutputFormat } from "../output/formatter.js";
import { register } from "./registry.js";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

function levelColor(level: string): (s: string) => string {
  switch (level) {
    case "error":
      return pc.red;
    case "warn":
      return pc.yellow;
    case "debug":
      return pc.dim;
    default:
      return (s: string) => s;
  }
}

function statusColor(status: number): (s: string) => string {
  if (status >= 400) return pc.red;
  if (status >= 300) return pc.yellow;
  return pc.green;
}

function formatPageEvent(event: PageEvent): string {
  const time = formatTime(event.timestamp);
  return `${pc.dim(time)} ${pc.cyan("PAGE")}     ${event.type}${event.url ? ` ${event.url}` : ""}`;
}

function formatConsoleEvent(event: ConsoleEvent): string {
  const time = formatTime(event.timestamp);
  const colorFn = levelColor(event.level);
  const label = colorFn(event.level.toUpperCase().padEnd(5));
  const text = event.text.length > 200 ? event.text.slice(0, 200) + "..." : event.text;
  return `${pc.dim(time)} ${pc.magenta("CONSOLE")} ${label} ${text}`;
}

function formatNetworkEvent(event: NetworkEvent): string {
  const time = formatTime(event.timestamp);
  if (event.type === "request") {
    const method = event.method.padEnd(4);
    return `${pc.dim(time)} ${pc.blue("NET")}     ${pc.dim("→")} ${method} ${event.url}`;
  } else if (event.type === "response") {
    const colorFn = statusColor(event.status);
    return `${pc.dim(time)} ${pc.blue("NET")}     ${pc.dim("←")} ${colorFn(String(event.status))} ${event.url}`;
  } else {
    return `${pc.dim(time)} ${pc.red("NET")}     ${pc.red("✗")} ${event.url} ${pc.dim(event.error)}`;
  }
}

function formatDialogEvent(event: DialogEvent): string {
  const time = formatTime(event.timestamp);
  return `${pc.dim(time)} ${pc.yellow("DIALOG")}  ${event.type}: ${event.message}`;
}

function formatDownloadEvent(event: DownloadEvent): string {
  const time = formatTime(event.timestamp);
  return `${pc.dim(time)} ${pc.green("DOWNLOAD")} ${event.state} ${event.suggestedFilename ?? event.url}`;
}

async function watchCommand(args: string[], _flags: GlobalFlags, client: BAPClient): Promise<void> {
  const format = getOutputFormat();
  const isJson = format === "json";

  // Parse --filter flag from args
  const filterArg = args.find((a) => a.startsWith("--filter="));
  const allowedTypes = filterArg ? new Set(filterArg.slice("--filter=".length).split(",")) : null;

  const shouldShow = (type: string): boolean => !allowedTypes || allowedTypes.has(type);

  if (!isJson) {
    const filterLabel = allowedTypes ? ` (${[...allowedTypes].join(", ")})` : "";
    console.log(`${pc.bold("Watching browser events")}${pc.dim(filterLabel)}`);
    console.log(pc.dim("Press Ctrl+C to stop\n"));
  }

  // Subscribe to events
  if (shouldShow("page")) {
    client.on("page", (event: PageEvent) => {
      if (isJson) {
        console.log(JSON.stringify({ eventType: "page", ...event }));
      } else {
        console.log(formatPageEvent(event));
      }
    });
  }

  if (shouldShow("console")) {
    client.on("console", (event: ConsoleEvent) => {
      if (isJson) {
        console.log(JSON.stringify({ eventType: "console", ...event }));
      } else {
        console.log(formatConsoleEvent(event));
      }
    });
  }

  if (shouldShow("network")) {
    client.on("network", (event: NetworkEvent) => {
      if (isJson) {
        console.log(JSON.stringify({ eventType: "network", ...event }));
      } else {
        console.log(formatNetworkEvent(event));
      }
    });
  }

  if (shouldShow("dialog")) {
    client.on("dialog", (event: DialogEvent) => {
      if (isJson) {
        console.log(JSON.stringify({ eventType: "dialog", ...event }));
      } else {
        console.log(formatDialogEvent(event));
      }
    });
  }

  if (shouldShow("download")) {
    client.on("download", (event: DownloadEvent) => {
      if (isJson) {
        console.log(JSON.stringify({ eventType: "download", ...event }));
      } else {
        console.log(formatDownloadEvent(event));
      }
    });
  }

  // Keep the process alive until interrupted
  await new Promise<void>((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
      client.off("close", cleanup);
      if (!isJson) {
        console.log(pc.dim("\nStopped watching."));
      }
      resolve();
    };
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    client.on("close", cleanup);
  });
}

register("watch", watchCommand);
