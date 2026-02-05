# @browseragentprotocol/logger

Pretty logging utilities for Browser Agent Protocol packages with colors and icons.

## Installation

```bash
npm install @browseragentprotocol/logger
```

## Usage

### Basic Logger

```typescript
import { Logger } from "@browseragentprotocol/logger";

const log = new Logger({ prefix: "MyApp" });

log.info("Server starting...");
log.success("Connected to database");
log.warn("Cache miss");
log.error("Connection failed");
log.debug("Request payload:", { id: 123 });
```

Output:
```
[MyApp] ℹ Server starting...
[MyApp] ✓ Connected to database
[MyApp] ⚠ Cache miss
[MyApp] ✗ Connection failed
```

### Log Levels

```typescript
const log = new Logger({
  prefix: "Server",
  level: "warn", // Only show warn and error
});

log.info("This won't show");
log.warn("This will show");
```

### Boxes and Banners

```typescript
import { box, banner, table } from "@browseragentprotocol/logger";

// Startup banner
console.log(banner({
  title: "BAP Server",
  version: "1.0.0",
  subtitle: "Browser Agent Protocol"
}));

// Info box
console.log(box([
  "Status:  Running",
  "Port:    9222",
  "Browser: chromium"
], { title: "Server Info" }));

// Key-value table
console.log(table([
  { icon: "🌐", label: "URL", value: "ws://localhost:9222" },
  { icon: "🔒", label: "Auth", value: "Enabled" }
]));
```

### Status Lines

```typescript
import { status, kv, icons } from "@browseragentprotocol/logger";

console.log(status("running", "Server is running"));
console.log(status("connected", "Client connected"));
console.log(status("error", "Connection failed"));

console.log(kv("Port", "9222"));
console.log(kv("Browser", "chromium"));
```

### Spinner

```typescript
import { Spinner } from "@browseragentprotocol/logger";

const spinner = new Spinner("Loading...");
spinner.start();

// Later...
spinner.succeed("Loaded successfully");
// or
spinner.fail("Failed to load");
```

### Icons

```typescript
import { icons, pc } from "@browseragentprotocol/logger";

console.log(`${icons.browser} Browser launched`);
console.log(`${icons.success} ${pc.green("Success!")}`);
console.log(`${icons.rocket} Deploying...`);
```

Available icons:
- Status: `success`, `error`, `warning`, `info`, `debug`
- Actions: `arrow`, `arrowDown`, `pointer`, `bullet`
- Objects: `browser`, `server`, `connection`, `lock`, `unlock`, `key`
- Indicators: `play`, `stop`, `pause`, `loading`
- Misc: `sparkle`, `rocket`, `check`, `cross`, `clock`

### Colors (via picocolors)

```typescript
import { pc } from "@browseragentprotocol/logger";

console.log(pc.green("Success"));
console.log(pc.red("Error"));
console.log(pc.yellow("Warning"));
console.log(pc.cyan("Info"));
console.log(pc.dim("Debug"));
console.log(pc.bold("Important"));
```

## API

### Logger

```typescript
new Logger(options?: LoggerOptions)
```

Options:
- `prefix` - Prefix shown before messages (default: "BAP")
- `level` - Minimum log level: "debug" | "info" | "success" | "warn" | "error"
- `enabled` - Enable/disable logging (default: true)
- `stderr` - Use stderr for all output (default: false)
- `timestamps` - Show ISO timestamps (default: false)

Methods:
- `debug(message, ...args)` - Debug level (gray)
- `info(message, ...args)` - Info level (cyan icon)
- `success(message, ...args)` - Success level (green checkmark)
- `warn(message, ...args)` - Warning level (yellow)
- `error(message, ...args)` - Error level (red)
- `step(current, total, message)` - Progress step
- `log(icon, message, color?)` - Custom icon log
- `child(prefix)` - Create child logger

### Utilities

- `box(lines, options?)` - Draw a box around content
- `banner(options)` - Create a startup banner
- `table(rows, labelColor?)` - Format key-value table
- `status(state, message)` - Format status line
- `kv(key, value, keyColor?)` - Format key-value pair

## License

Apache-2.0
