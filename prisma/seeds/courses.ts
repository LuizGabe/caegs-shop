import { PrismaClient } from "@prisma/client";

export async function seedBaseData(prisma: PrismaClient) {
  console.log("[seed] Inicializando seed dos dados base...");

  const softwareEngineering = await prisma.course.upsert({
    where: { slug: "engenharia-de-software" },
    update: { name: "Engenharia de Software", canPurchase: true, deletedAt: null },
    create: {
      name: "Engenharia de Software",
      slug: "engenharia-de-software",
      canPurchase: true
    }
  });
  console.log(`[seed] Curso garantido: ${softwareEngineering.name} (canPurchase: true)`);

  const computerScience = await prisma.course.upsert({
    where: { slug: "ciencia-da-computacao" },
    update: { name: "Ciência da Computação", canPurchase: false, deletedAt: null },
    create: {
      name: "Ciência da Computação",
      slug: "ciencia-da-computacao",
      canPurchase: false
    }
  });
  console.log(`[seed] Curso garantido: ${computerScience.name} (canPurchase: false)`);

  await prisma.appSetting.upsert({
    where: { key: "emailsEnabled" },
    update: {},
    create: { key: "emailsEnabled", value: false }
  });
  console.log("[seed] Configurações de aplicação garantidas.");

  return { coursesCount: 2 };
}
