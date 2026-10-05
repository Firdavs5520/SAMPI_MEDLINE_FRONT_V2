const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

// Worker ishga tushmasa yoki o'lib qolsa shu xato qaytadi: chek hali printerga
// yuborilmagan, shuning uchun bir martalik PowerShell bilan qayta urinish xavfsiz.
class RawPrintWorkerUnavailableError extends Error {}

const READY_TIMEOUT_MS = 20000;
const encodeArg = (value) => Buffer.from(String(value || ""), "utf8").toString("base64");

// Doim ochiq turadigan PowerShell: printer kodi bir marta kompilyatsiya qilinadi,
// keyin har chek uchun faqat bitta qator buyruq yuboriladi. Cheklar navbat bilan chiqadi.
const createRawPrintWorker = ({ powershellPath, scriptText, tempDir, jobTimeoutMs }) => {
  let child = null;
  let readyPromise = null;
  let pending = null;
  let stdoutBuffer = "";
  let sequence = 0;
  let queue = Promise.resolve();

  const stop = () => {
    if (child) {
      try {
        child.kill();
      } catch {
        // allaqachon yopilgan
      }
    }
    child = null;
    readyPromise = null;
  };

  const handleLine = (line, markReady) => {
    if (line === "SAMPI-READY") {
      markReady();
      return;
    }
    const match = /^SAMPI-DONE (\d+) (OK|ERR)(?: (\S*))?$/.exec(line);
    if (!match || !pending || pending.id !== match[1]) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    if (match[2] === "OK") {
      current.resolve();
      return;
    }
    const message = Buffer.from(match[3] || "", "base64").toString("utf8");
    current.reject(new Error(message || "Chek printerga yuborilmadi."));
  };

  const start = () => {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      await fs.mkdir(tempDir, { recursive: true });
      const scriptPath = path.join(tempDir, "sampi-raw-print-worker.ps1");
      await fs.writeFile(scriptPath, scriptText, "utf8");

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(readyTimer);
          if (error) reject(error);
          else resolve();
        };

        const proc = spawn(
          powershellPath,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
          { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
        );
        child = proc;
        stdoutBuffer = "";

        const readyTimer = setTimeout(() => {
          finish(new RawPrintWorkerUnavailableError("Printer worker vaqtida ishga tushmadi."));
          if (child === proc) stop();
        }, READY_TIMEOUT_MS);

        proc.stdout.setEncoding("utf8");
        proc.stdout.on("data", (chunk) => {
          stdoutBuffer += chunk;
          let newline = stdoutBuffer.indexOf("\n");
          while (newline >= 0) {
            const line = stdoutBuffer.slice(0, newline).trim();
            stdoutBuffer = stdoutBuffer.slice(newline + 1);
            if (line) handleLine(line, () => finish());
            newline = stdoutBuffer.indexOf("\n");
          }
        });
        proc.stderr.on("data", () => {
          // PowerShell ogohlantirishlari; natija faqat stdout'dagi SAMPI- qatorlaridan olinadi.
        });
        proc.stdin.on("error", () => {});
        proc.on("error", (error) => {
          finish(new RawPrintWorkerUnavailableError(error.message));
        });
        proc.on("exit", () => {
          if (child === proc) {
            child = null;
            readyPromise = null;
          }
          finish(new RawPrintWorkerUnavailableError("Printer worker yopildi."));
          if (pending) {
            const current = pending;
            pending = null;
            clearTimeout(current.timer);
            current.reject(
              current.sent
                ? new Error("Printer worker chek chiqarish paytida yopildi.")
                : new RawPrintWorkerUnavailableError("Printer worker yopildi.")
            );
          }
        });
      });
    })().catch((error) => {
      readyPromise = null;
      throw error instanceof RawPrintWorkerUnavailableError
        ? error
        : new RawPrintWorkerUnavailableError(error.message);
    });

    return readyPromise;
  };

  const runOne = async (printerName, dataPath, jobName) => {
    await start();
    const proc = child;
    if (!proc || !proc.stdin.writable) {
      throw new RawPrintWorkerUnavailableError("Printer worker tayyor emas.");
    }

    sequence += 1;
    const id = String(sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending?.id !== id) return;
        pending = null;
        // Chek chiqqan-chiqmagani noma'lum: qayta yuborilmaydi, worker qayta ishga tushadi.
        stop();
        reject(new Error("RAW printer vazifasi vaqtida tugamadi."));
      }, jobTimeoutMs);
      pending = { id, resolve, reject, timer, sent: false };
      proc.stdin.write(
        `${id} ${encodeArg(printerName)} ${encodeArg(dataPath)} ${encodeArg(jobName)}\n`,
        (error) => {
          if (error && pending?.id === id) {
            pending = null;
            clearTimeout(timer);
            reject(new RawPrintWorkerUnavailableError(error.message));
          }
        }
      );
      if (pending?.id === id) pending.sent = true;
    });
  };

  const run = (printerName, dataPath, jobName) => {
    const result = queue.then(() => runOne(printerName, dataPath, jobName));
    queue = result.catch(() => {});
    return result;
  };

  return {
    run,
    warmUp: () => start().catch(() => {}),
    stop,
  };
};

module.exports = { createRawPrintWorker, RawPrintWorkerUnavailableError };
