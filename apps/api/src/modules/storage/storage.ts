import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const acceptedTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
export type UploadInput = { fileName: string; mimeType: string; contentBase64: string };
export type StoredFile = { key: string; url: string };
export interface StorageService { upload(input: UploadInput): Promise<StoredFile>; read(key: string): Promise<Buffer | null>; }
function fileMatchesMimeType(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  return false;
}
export class LocalStorageService implements StorageService {
  constructor(private readonly root = join(process.cwd(), "uploads")) {}
  async upload(input: UploadInput): Promise<StoredFile> {
    const extension = acceptedTypes.get(input.mimeType);
    const fileExtension = extname(input.fileName).toLowerCase();
    if (!extension || (fileExtension !== extension && !(extension === ".jpg" && fileExtension === ".jpeg"))) throw Object.assign(new Error("Tipo ou extensao de imagem nao permitido."), { statusCode: 400 });
    const content = Buffer.from(input.contentBase64, "base64");
    if (!content.length || content.length > MAX_IMAGE_SIZE || !fileMatchesMimeType(content, input.mimeType)) throw Object.assign(new Error("Arquivo de imagem invalido ou maior que 5 MB."), { statusCode: 400 });
    const key = `${randomUUID()}-${createHash("sha256").update(content).digest("hex").slice(0, 12)}${extension}`;
    await mkdir(this.root, { recursive: true }); await writeFile(join(this.root, key), content, { flag: "wx" });
    return { key, url: `/uploads/${key}` };
  }
  async read(key: string) { if (!/^[a-z0-9-]+\.(jpg|png|webp)$/i.test(key)) return null; try { return await readFile(join(this.root, key)); } catch { return null; } }
}
export const storage = new LocalStorageService();