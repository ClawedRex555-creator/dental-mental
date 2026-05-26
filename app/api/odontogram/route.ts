import { existsSync, readFileSync } from "fs";
import path from "path";

function candidatePaths(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return [
    path.join(process.cwd(), "public", "dental", "odontogram.png"),
    path.join(
      home,
      ".cursor/projects/e-projects-dentalcloud-mis/assets/c__Users_______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_i-8c4a4c18-ce7c-48f2-aa83-ef45b62207ca.png"
    ),
    path.join(process.cwd(), "public", "dental", "odontogram.jpg"),
    path.join(process.cwd(), "public", "dental", "i.jpg"),
    path.join(process.cwd(), "i.jpg"),
    path.join(
      home,
      ".cursor/projects/e-projects-dentalcloud-mis/assets/c__Users_______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_i-7d628ad0-5469-4d77-85cd-b13c39fcea91.png"
    ),
    path.join(
      home,
      ".cursor/projects/e-projects-dentalcloud-mis/assets/c__Users_______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_i-83595f8a-bf4d-4531-b037-eee23310a41b.png"
    ),
  ];
}

export async function GET() {
  for (const filePath of candidatePaths()) {
    if (!existsSync(filePath)) continue;
    const buf = readFileSync(filePath);
    const type = filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
    return new Response(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  return new Response("Odontogram image not found", { status: 404 });
}
