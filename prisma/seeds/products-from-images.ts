import { PrismaClient, ProductImageType } from "@prisma/client";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();
const TEST_IMAGES_DIR = join(PROJECT_ROOT, "testes_imagens");
const ROOT_UPLOADS_DIR = join(PROJECT_ROOT, "uploads");
const API_UPLOADS_DIR = join(PROJECT_ROOT, "apps", "api", "uploads");
const CACHE_DIR = join(PROJECT_ROOT, ".cache");
const CACHE_FILE = join(CACHE_DIR, "image-analysis.json");
const ANALYZER_SCRIPT = join(PROJECT_ROOT, "analisar_imagem.py");

type AnalysisResult = {
  productType?: string;
  color?: string;
  description?: string;
  altText?: string;
  isPrimary?: boolean;
  isSizeGuide?: boolean;
};

type CacheSchema = Record<string, { hash: string; mtime: number; analysis: AnalysisResult }>;

async function loadCache(): Promise<CacheSchema> {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = await readFile(CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // Ignore cache load errors
  }
  return {};
}

async function saveCache(cache: CacheSchema) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.warn("[seed] Aviso: Não foi possível salvar o cache de análises:", error);
  }
}

async function analyzeImageWithAI(imagePath: string): Promise<AnalysisResult | null> {
  if (!existsSync(ANALYZER_SCRIPT)) {
    return null;
  }

  const prompt = `Analise esta imagem de vestuario/produto. Responda ESTRITAMENTE em formato JSON valido sem markdown nem cercas de codigo: {"productType": "tipo do produto", "color": "cor principal", "description": "descricao em 1 frase simples sem marketing", "altText": "descricao acessivel da imagem", "isPrimary": true se for vista frontal principal senao false, "isSizeGuide": true se for tabela/guia de medidas senao false}`;

  try {
    console.log(`[seed] Executando análise Gemini para: ${basename(imagePath)}`);
    const { stdout } = await execFileAsync("python", [ANALYZER_SCRIPT, "-i", imagePath, "-p", prompt], {
      timeout: 25000
    });

    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;
      return parsed;
    }
  } catch (error) {
    console.warn(`[seed] Aviso ao analisar ${basename(imagePath)} com IA:`, (error as Error).message);
  }

  return null;
}

async function getOrAnalyzeImage(imagePath: string, cache: CacheSchema): Promise<AnalysisResult> {
  const relPath = relative(PROJECT_ROOT, imagePath);
  const fileStat = await stat(imagePath);
  const fileBuffer = await readFile(imagePath);
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  const cached = cache[relPath];
  if (cached && cached.hash === fileHash) {
    return cached.analysis;
  }

  const result = await analyzeImageWithAI(imagePath);
  const analysis: AnalysisResult = result || {};

  cache[relPath] = {
    hash: fileHash,
    mtime: fileStat.mtimeMs,
    analysis
  };

  return analysis;
}

const PRODUCT_METADATA_FALLBACKS: Record<
  string,
  { name: string; slug: string; salePrice: number; costPrice: number; description: string; variants: string[] }
> = {
  camiseta: {
    name: "Camiseta Oficial Engenharia de Software",
    slug: "camiseta-oficial-engenharia-de-software",
    salePrice: 65.0,
    costPrice: 40.0,
    description: "Camiseta preta oficial do Centro Acadêmico de Engenharia de Software UNIJUÍ.",
    variants: ["P", "M", "G", "GG", "XGG"]
  },
  "camiseta-babylook": {
    name: "Camiseta Baby Look Engenharia de Software",
    slug: "camiseta-baby-look-engenharia-de-software",
    salePrice: 65.0,
    costPrice: 40.0,
    description: "Camiseta preta modelo Baby Look oficial do curso de Engenharia de Software.",
    variants: ["P", "M", "G", "GG"]
  },
  "camiseta-gola-polo": {
    name: "Camiseta Gola Polo Engenharia de Software",
    slug: "camiseta-gola-polo-engenharia-de-software",
    salePrice: 75.0,
    costPrice: 45.0,
    description: "Camiseta modelo Gola Polo com bordado do Centro Acadêmico.",
    variants: ["P", "M", "G", "GG", "XGG"]
  },
  "camiseta-gola-polo-babylook": {
    name: "Camiseta Gola Polo Baby Look",
    slug: "camiseta-gola-polo-baby-look",
    salePrice: 75.0,
    costPrice: 45.0,
    description: "Camiseta Gola Polo feminina Baby Look do curso de Engenharia de Software.",
    variants: ["P", "M", "G", "GG"]
  },
  "casaco-soft": {
    name: "Casaco Soft Engenharia de Software",
    slug: "casaco-soft-engenharia-de-software",
    salePrice: 140.0,
    costPrice: 90.0,
    description: "Casaco térmico em tecido Soft com fecho em zíper e bordado frontal.",
    variants: ["P", "M", "G", "GG", "XGG"]
  },
  "casaco-soft-bandeira": {
    name: "Casaco Soft com Bandeira",
    slug: "casaco-soft-com-bandeira",
    salePrice: 145.0,
    costPrice: 95.0,
    description: "Casaco em tecido Soft com bordado do curso e detalhe de bandeira nas mangas.",
    variants: ["P", "M", "G", "GG", "XGG"]
  }
};

const ROOT_SIZE_GUIDE_MAP: Record<string, string> = {
  "tabela-medidas-baby-look.jpeg": "camiseta-babylook",
  "tabela-medidas-babylook-gola-polo.jpeg": "camiseta-gola-polo-babylook",
  "tabela-medidas-camiseta-gola-polo.jpeg": "camiseta-gola-polo",
  "tabela-medidas-camiseta.jpeg": "camiseta"
};

function frontImageRank(filename: string) {
  const name = basename(filename, extname(filename)).toLowerCase();
  if (name === "frente") return 0;
  if (/^frente(?:\b|[-_\s])/.test(name)) return 1;
  return 2;
}

async function copyToUploads(sourcePath: string): Promise<{ key: string; url: string }> {
  await mkdir(ROOT_UPLOADS_DIR, { recursive: true });
  await mkdir(API_UPLOADS_DIR, { recursive: true });

  const rawExt = extname(sourcePath).toLowerCase() || ".jpg";
  const ext = rawExt === ".jpeg" ? ".jpg" : rawExt;
  const fileContent = await readFile(sourcePath);
  const hash = createHash("sha256").update(fileContent).digest("hex").slice(0, 12);
  const key = `${randomUUID()}-${hash}${ext}`;

  const rootTargetPath = join(ROOT_UPLOADS_DIR, key);
  const apiTargetPath = join(API_UPLOADS_DIR, key);

  await writeFile(rootTargetPath, fileContent);
  await writeFile(apiTargetPath, fileContent);

  // Copy into Docker container cadev-api-1 if running
  try {
    await execFileAsync("docker", ["cp", rootTargetPath, `cadev-api-1:/app/uploads/${key}`]);
  } catch {
    // Docker container might not be running or named differently; continue
  }

  return { key, url: `/uploads/${key}` };
}

export async function seedProductsFromImages(prisma: PrismaClient) {
  console.log("\n[seed] ==================================================");
  console.log("[seed] Iniciando importação automática de produtos e imagens...");
  console.log("[seed] ==================================================\n");

  if (!existsSync(TEST_IMAGES_DIR)) {
    console.warn(`[seed] Aviso: Diretório '${TEST_IMAGES_DIR}' não encontrado.`);
    return { productsCreated: 0, imagesImported: 0, sizeGuidesImported: 0, variantsCreated: 0 };
  }

  const cache = await loadCache();
  const entries = await readdir(TEST_IMAGES_DIR, { withFileTypes: true });
  const productFolders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let totalProducts = 0;
  let totalImages = 0;
  let totalSizeGuides = 0;
  let totalVariants = 0;
  const unclassifiedFiles: string[] = [];

  for (let i = 0; i < productFolders.length; i++) {
    const folderName = productFolders[i];
    const folderPath = join(TEST_IMAGES_DIR, folderName);
    const fallback = PRODUCT_METADATA_FALLBACKS[folderName] || {
      name: folderName.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      slug: folderName,
      salePrice: 60.0,
      costPrice: 35.0,
      description: `Produto oficial do Centro Acadêmico: ${folderName}`,
      variants: ["P", "M", "G", "GG"]
    };

    console.log(`\n[seed] --------------------------------------------------`);
    console.log(`[seed] Processando pasta de produto [${i + 1}/${productFolders.length}]: ${folderName}`);

    const files = await readdir(folderPath);
    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

    const rootSizeGuides = Object.entries(ROOT_SIZE_GUIDE_MAP)
      .filter(([, targetFolder]) => targetFolder === folderName)
      .map(([filename]) => join(TEST_IMAGES_DIR, filename));

    console.log(`[seed] Arquivos de imagem no diretório: ${imageFiles.length}`);

    let productDescription = fallback.description;
    let productName = fallback.name;

    const product = await prisma.product.upsert({
      where: { slug: fallback.slug },
      update: {
        name: productName,
        description: productDescription,
        salePrice: fallback.salePrice,
        costPrice: fallback.costPrice,
        active: true,
        featured: i < 2,
        displayOrder: i,
        deletedAt: null
      },
      create: {
        name: productName,
        slug: fallback.slug,
        description: productDescription,
        salePrice: fallback.salePrice,
        costPrice: fallback.costPrice,
        active: true,
        featured: i < 2,
        displayOrder: i
      }
    });

    totalProducts++;

    for (let vIndex = 0; vIndex < fallback.variants.length; vIndex++) {
      const vName = fallback.variants[vIndex];
      await prisma.productVariant.upsert({
        where: { productId_name: { productId: product.id, name: vName } },
        update: { active: true, displayOrder: vIndex, deletedAt: null },
        create: {
          productId: product.id,
          name: vName,
          displayOrder: vIndex,
          active: true
        }
      });
      totalVariants++;
    }

    const processedImages: Array<{
      sourcePath: string;
      filename: string;
      isSizeGuide: boolean;
      isPrimary: boolean;
      analysis: AnalysisResult;
    }> = [];

    for (const file of imageFiles) {
      const fullPath = join(folderPath, file);
      const analysis = await getOrAnalyzeImage(fullPath, cache);

      const isSizeGuide =
        Boolean(analysis.isSizeGuide) ||
        /tabela|medida|tamanho|size/i.test(file);

      const isPrimary =
        !isSizeGuide && (frontImageRank(file) < 2 || Boolean(analysis.isPrimary));

      processedImages.push({
        sourcePath: fullPath,
        filename: file,
        isSizeGuide,
        isPrimary,
        analysis
      });
    }

    for (const rootGuidePath of rootSizeGuides) {
      if (existsSync(rootGuidePath)) {
        const analysis = await getOrAnalyzeImage(rootGuidePath, cache);
        processedImages.push({
          sourcePath: rootGuidePath,
          filename: basename(rootGuidePath),
          isSizeGuide: true,
          isPrimary: false,
          analysis
        });
      }
    }

    processedImages.sort((a, b) => {
      if (a.isSizeGuide !== b.isSizeGuide) return a.isSizeGuide ? 1 : -1;
      const frontRank = frontImageRank(a.filename) - frontImageRank(b.filename);
      if (frontRank !== 0) return frontRank;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.filename.localeCompare(b.filename);
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });

    for (let imgIndex = 0; imgIndex < processedImages.length; imgIndex++) {
      const img = processedImages[imgIndex];
      const { url } = await copyToUploads(img.sourcePath);

      const imageType: ProductImageType = img.isSizeGuide ? "SIZE_GUIDE" : "PRODUCT";
      if (img.isSizeGuide) totalSizeGuides++;
      else totalImages++;

      const altText =
        img.analysis.altText ||
        (img.isSizeGuide
          ? `Tabela de medidas para ${productName}`
          : `${productName} - vista ${img.filename.replace(/\.[^/.]+$/, "")}`);

      await prisma.productImage.create({
        data: {
          productId: product.id,
          url,
          altText,
          type: imageType,
          displayOrder: imgIndex
        }
      });

      console.log(
        `  -> Imagem importada: ${img.filename} | Tipo: ${imageType} | Ordem: ${imgIndex} | URL: ${url}`
      );
    }
  }

  await saveCache(cache);

  console.log("\n[seed] ==================================================");
  console.log("[seed] RESUMO DA IMPORTAÇÃO AUTOMÁTICA DE PRODUTOS:");
  console.log(`[seed] - Produtos criados: ${totalProducts}`);
  console.log(`[seed] - Variantes criadas: ${totalVariants}`);
  console.log(`[seed] - Fotos de produto importadas: ${totalImages}`);
  console.log(`[seed] - Guias de medida identificadas: ${totalSizeGuides}`);
  console.log("[seed] ==================================================\n");

  return {
    productsCreated: totalProducts,
    imagesImported: totalImages,
    sizeGuidesImported: totalSizeGuides,
    variantsCreated: totalVariants,
    unclassifiedFiles
  };
}