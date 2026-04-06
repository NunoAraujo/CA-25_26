import { prisma } from "./prisma";

const DEFAULT_EMAIL = "local-user@journaling.app";

export async function getOrCreateDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_EMAIL },
    update: {},
    create: { email: DEFAULT_EMAIL },
  });
}
