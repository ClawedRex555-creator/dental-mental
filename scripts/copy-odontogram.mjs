import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const sources = [
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/e-projects-dentalcloud-mis/assets/c__Users_______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_i-8c4a4c18-ce7c-48f2-aa83-ef45b62207ca.png"
  ),
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/e-projects-dentalcloud-mis/assets/c__Users_______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_i-7d628ad0-5469-4d77-85cd-b13c39fcea91.png"
  ),
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/e-projects-dentalcloud-mis/assets/c__Users_______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_i-83595f8a-bf4d-4531-b037-eee23310a41b.png"
  ),
  path.join(root, "i.jpg"),
];

const destDir = path.join(root, "public", "dental");
const dest = path.join(destDir, "odontogram.png");

fs.mkdirSync(destDir, { recursive: true });

for (const src of sources) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log("OK:", dest, fs.statSync(dest).size, "bytes from", src);
    process.exit(0);
  }
}

console.error("No source image found. Copy i.jpg to public/dental/odontogram.png manually.");
process.exit(1);
