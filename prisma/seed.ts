import { PrismaClient } from "@prisma/client";
import { seedBaseData } from "./seeds/courses.js";
import { seedProductsFromImages } from "./seeds/products-from-images.js";

const prisma = new PrismaClient();

function validateEnvironmentSafety() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const allowReset = process.env.ALLOW_DATABASE_RESET === "true";

  // Check 1: Must be explicitly enabled via ALLOW_DATABASE_RESET=true
  if (!allowReset) {
    console.error(
      "\n[ERRO DE SEGURANÇA] Operação destrutiva abortada!\n" +
        "Para executar a limpeza completa e seed no ambiente de desenvolvimento, defina a variável:\n" +
        "ALLOW_DATABASE_RESET=true\n"
    );
    process.exit(1);
  }

  // Check 2: DATABASE_URL safety check
  const isDevUrl =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("ca_platform") ||
    databaseUrl.includes("5432");

  const isProductionDomain =
    databaseUrl.includes("amazonaws.com") ||
    databaseUrl.includes("rds.") ||
    databaseUrl.includes("neon.tech") ||
    databaseUrl.includes("supabase.co") ||
    databaseUrl.includes("cockroachlabs.cloud") ||
    databaseUrl.includes("production");

  if (!isDevUrl || isProductionDomain) {
    console.error(
      "\n[ERRO DE SEGURANÇA] Operação destrutiva bloqueada!\n" +
        `A DATABASE_URL fornecida (${databaseUrl.slice(0, 30)}...) aparenta ser de ambiente de PRODUÇÃO ou remoto.\n` +
        "O reset do banco de dados somente pode ser executado em ambiente de desenvolvimento local (localhost/127.0.0.1).\n"
    );
    process.exit(1);
  }
}

async function clearDatabase() {
  console.log("\n[reset] Limpando dados do banco de desenvolvimento...");
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "AuditLog", "EmailEvent", "AppSetting", "ProductionBatchOrder", "ProductionBatch",
        "OrderStatusHistory", "WebhookEvent", "Payment", "OrderItem", "Order",
        "Announcement", "ProductImage", "ProductVariant", "Product", "Session",
        "User", "Course"
      RESTART IDENTITY CASCADE;
    `);
    console.log("[reset] Todos os dados das tabelas foram limpos via TRUNCATE CASCADE.");
  } catch (err) {
    console.warn("[reset] Aviso ao truncar tabelas:", (err as Error).message);
  }
}

async function main() {
  console.log("[seed] Iniciando processo de reset e população de dados...");

  validateEnvironmentSafety();
  await clearDatabase();

  const baseResult = await seedBaseData(prisma);
  const productsResult = await seedProductsFromImages(prisma);

  console.log("\n==================================================");
  console.log("  SEED CONCLUÍDO COM SUCESSO!");
  console.log("==================================================");
  console.log(`  - Cursos criados: ${baseResult.coursesCount}`);
  console.log(`  - Produtos cadastrados: ${productsResult.productsCreated}`);
  console.log(`  - Fotos de produtos importadas: ${productsResult.imagesImported}`);
  console.log(`  - Guias de medida identificadas: ${productsResult.sizeGuidesImported}`);
  console.log(`  - Variantes/Tamanhos gerados: ${productsResult.variantsCreated}`);
  console.log("==================================================\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("\n[ERRO CRÍTICO NO SEED]:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
