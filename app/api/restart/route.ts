import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST() {
  // Touch a watched file to trigger Next.js dev server hot reload
  // This restarts the server without killing the process
  const restartFile = path.join(process.cwd(), "lib", "restart-trigger.ts");
  const stamp = `// restart triggered at ${new Date().toISOString()}\nexport const RESTART_TS = ${Date.now()};\n`;
  fs.writeFileSync(restartFile, stamp);
  return NextResponse.json({ ok: true, message: "Restarting..." });
}
