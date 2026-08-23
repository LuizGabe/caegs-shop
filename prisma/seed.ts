import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.course.upsert({
    where: { slug: "engenharia-de-software" },
    update: { name: "Engenharia de Software", canPurchase: true, deletedAt: null },
    create: {
      name: "Engenharia de Software",
      slug: "engenharia-de-software",
      canPurchase: true
    }
  });

  await prisma.course.upsert({
    where: { slug: "ciencia-da-computacao" },
    update: { name: "Ciência da Computação", canPurchase: false, deletedAt: null },
    create: {
      name: "Ciência da Computação",
      slug: "ciencia-da-computacao",
      canPurchase: false
    }
  });

  await prisma.appSetting.upsert({
    where: { key: "emailsEnabled" },
    update: {},
    create: { key: "emailsEnabled", value: false }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
