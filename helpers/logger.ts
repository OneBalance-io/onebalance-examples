import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple file logger that writes to both console and log file
 */
export class Logger {
  private logFilePath: string;
  private logStream: fs.WriteStream;

  constructor(logFileName: string, logsDir: string = 'logs') {
    // Ensure logs directory exists (relative to project root)
    const fullLogsDir = path.join(process.cwd(), logsDir);
    if (!fs.existsSync(fullLogsDir)) {
      fs.mkdirSync(fullLogsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.logFilePath = path.join(fullLogsDir, `${logFileName}-${timestamp}.md`);
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

    // Write header
    this.logStream.write(`# ${logFileName}\n\n`);
    this.logStream.write(`**Started:** ${new Date().toISOString()}\n\n`);
    this.logStream.write('---\n\n');
  }

  log(...args: any[]) {
    const message = args
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(' ');
    console.log(...args);
    this.logStream.write(`${message}\n`);
  }

  error(...args: any[]) {
    const message = args
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(' ');
    console.error(...args);
    this.logStream.write(`❌ ERROR: ${message}\n`);
  }

  section(title: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(title);
    console.log('='.repeat(60));
    this.logStream.write(`\n## ${title}\n\n`);
  }

  subsection(title: string) {
    this.logStream.write(`\n### ${title}\n\n`);
  }

  code(language: string, code: string) {
    this.logStream.write(`\`\`\`${language}\n${code}\n\`\`\`\n\n`);
  }

  close() {
    this.logStream.write(`\n---\n\n**Completed:** ${new Date().toISOString()}\n`);
    this.logStream.end();
    console.log(`\n📝 Log saved to: ${this.logFilePath}`);
  }

  getLogPath(): string {
    return this.logFilePath;
  }
}

/**
 * Create a logger instance for a specific example
 */
export function createLogger(exampleName: string, logsDir: string = 'logs'): Logger {
  return new Logger(exampleName, logsDir);
}
