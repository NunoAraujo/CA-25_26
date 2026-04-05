import { ActivityIntensity } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { prisma } from "../lib/prisma";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

if (process.env.DATABASE_URL?.includes("@postgres:") && !process.env.DOCKER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    "@postgres:",
    "@localhost:",
  );
}

type ActivitySeed = {
  activityId: string;
  activityName: string;
  description: string;
  durationMin: number;
  intensity: ActivityIntensity;
  category: string;
  targetEmotions: string[];
  contraindications: string[];
  instructions: string;
  resources?: string;
};

const activities: ActivitySeed[] = [
  {
    activityId: "box-breathing-4-4-4-4",
    activityName: "Respiracao Caixa 4-4-4-4",
    description:
      "Tecnica curta de respiracao para reduzir ansiedade e regular ativacao.",
    durationMin: 5,
    intensity: ActivityIntensity.low,
    category: "breathing",
    targetEmotions: ["anxiety", "anger"],
    contraindications: ["hiperventilacao", "desconforto respiratorio agudo"],
    instructions:
      "Inspire 4 segundos, segure 4, expire 4, segure 4. Repita por 5 minutos em ritmo confortavel.",
    resources: "Timer opcional com marcacao de 4 segundos por fase.",
  },
  {
    activityId: "body-scan-10",
    activityName: "Body Scan Guiado",
    description:
      "Varredura corporal para reduzir tensao fisica e aumentar sensacao de calma.",
    durationMin: 10,
    intensity: ActivityIntensity.low,
    category: "mindfulness",
    targetEmotions: ["anxiety", "sadness"],
    contraindications: ["dor intensa sem acompanhamento medico"],
    instructions:
      "Sente-se ou deite-se. Leve a atencao da cabeca aos pes, percebendo tensoes e soltando cada regiao progressivamente.",
  },
  {
    activityId: "grounding-5-4-3-2-1",
    activityName: "Grounding 5-4-3-2-1",
    description:
      "Exercicio sensorial para estabilizar pensamentos acelerados e reduzir sobrecarga emocional.",
    durationMin: 7,
    intensity: ActivityIntensity.low,
    category: "grounding",
    targetEmotions: ["anxiety", "anger"],
    contraindications: [],
    instructions:
      "Nomeie 5 coisas que ve, 4 que toca, 3 que ouve, 2 que cheira e 1 que sente no corpo agora.",
  },
  {
    activityId: "walk-light-15",
    activityName: "Caminhada Leve",
    description:
      "Atividade fisica curta para elevar energia e reduzir ruminação.",
    durationMin: 15,
    intensity: ActivityIntensity.medium,
    category: "movement",
    targetEmotions: ["sadness", "low_energy"],
    contraindications: ["lesao ortopedica sem liberacao"],
    instructions:
      "Caminhe em ritmo confortavel por 15 minutos. Foque em postura, respiracao nasal e passos constantes.",
  },
  {
    activityId: "journal-reframe-10",
    activityName: "Reestruturacao Cognitiva Breve",
    description:
      "Escrita guiada para identificar pensamento automatico e formular alternativa mais equilibrada.",
    durationMin: 10,
    intensity: ActivityIntensity.medium,
    category: "cognitive",
    targetEmotions: ["anxiety", "sadness", "anger"],
    contraindications: [],
    instructions:
      "Escreva: situacao, pensamento automatico, emocao, evidencia a favor/contra e nova interpretacao realista.",
  },
];

async function seedActivities() {
  let created = 0;
  let updated = 0;

  for (const activity of activities) {
    const existing = await prisma.activityLibrary.findUnique({
      where: { activityId: activity.activityId },
      select: { id: true },
    });

    await prisma.activityLibrary.upsert({
      where: { activityId: activity.activityId },
      create: activity,
      update: activity,
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  const total = await prisma.activityLibrary.count();
  console.log(
    JSON.stringify(
      {
        message: "ActivityLibrary seed completed",
        created,
        updated,
        total,
      },
      null,
      2,
    ),
  );
}

seedActivities()
  .catch((error) => {
    console.error("ActivityLibrary seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
