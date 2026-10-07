import { z } from "zod";

// Input shapes mirror the client's file as delivered (Spanish keys). We validate
// only what the evaluator relies on and let any extra fields pass through.

export const TurnSchema = z.object({
  hablante: z.string().min(1),
  texto: z.string(),
});

export const CustomerDataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const ConversationSchema = z.looseObject({
  id: z.string().min(1),
  fecha_llamada: z.iso.date(),
  datos_cliente: CustomerDataSchema,
  transcripcion: z.array(TurnSchema).min(1),
});

export const AgentSpecSchema = z.looseObject({
  nombre_agente: z.string().optional(),
  empresa: z.string().optional(),
  canal: z.string().optional(),
  objetivo: z.string().optional(),
  reglas: z.array(z.string().min(1)).min(1),
});

export const DatasetSchema = z.looseObject({
  descripcion: z.string().optional(),
  especificacion_agente: AgentSpecSchema,
  conversaciones: z.array(ConversationSchema).min(1),
});

export type Turn = z.infer<typeof TurnSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;

const RULE_PATTERN = /^\s*(R\d+)\s*[.:)-]\s*([\s\S]+)$/;

/** Splits "R1. Presentarse como…" into { id: "R1", text: "Presentarse como…" }. */
export function parseRules(rules: string[]): { id: string; text: string }[] {
  return rules.map((raw, index) => {
    const match = raw.match(RULE_PATTERN);
    return match
      ? { id: match[1], text: match[2].trim() }
      : { id: `R${index + 1}`, text: raw.trim() };
  });
}
