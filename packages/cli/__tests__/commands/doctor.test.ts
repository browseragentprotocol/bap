import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
const buildDoctorReport = vi.fn();
const formatDoctorReport = vi.fn();
const getOutputFormat = vi.fn();
const printJson = vi.fn();

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/doctor.js", () => ({
  buildDoctorReport,
  formatDoctorReport,
}));

vi.mock("../../src/output/formatter.js", () => ({
  getOutputFormat,
  printJson,
}));

const { doctorCommand } = await import("../../src/commands/doctor.js");

describe("doctorCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildDoctorReport.mockReturnValue({
      config: { browser: "chrome", headless: false, profile: "auto", port: 9222, timeout: 30000 },
      launchPlan: { ready: true, primary: "Use installed Chrome", fallbacks: [] },
      checks: [],
      nextSteps: [],
    });
    formatDoctorReport.mockReturnValue("### BAP Doctor");
  });

  it("prints the formatted doctor report in non-json modes", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    getOutputFormat.mockReturnValue("agent");

    await doctorCommand([], {} as never, {} as never);

    expect(buildDoctorReport).toHaveBeenCalled();
    expect(formatDoctorReport).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("### BAP Doctor");
    expect(printJson).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("emits JSON when the output mode is json", async () => {
    getOutputFormat.mockReturnValue("json");

    await doctorCommand([], {} as never, {} as never);

    expect(printJson).toHaveBeenCalledWith(expect.objectContaining({ type: "doctor" }));
    expect(formatDoctorReport).not.toHaveBeenCalled();
  });
});
