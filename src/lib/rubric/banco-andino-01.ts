import type { Rubric } from "@/lib/schemas/rubric";

const llm = { type: "llm" } as const;

/**
 * Hand-designed rubric for Lina (Banco Andino collections agent).
 * Conditional sub-rules start with "Si…" so the judge returns not_applicable
 * when the situation never happens in the call.
 */
export const BANCO_ANDINO_01: Rubric = {
  name: "Banco_Andino_01",
  description: "Rúbrica base para Lina, agente de cobranza por voz de Banco Andino (R1–R10).",
  isDefault: true,
  content: {
    agent: {
      name: "Lina",
      company: "Banco Andino (ficticio)",
      channel: "Voz - llamada saliente de cobranza",
      objective:
        "Obtener un compromiso de pago del titular de la obligación, respetando las políticas de privacidad, las reglas de negociación y un trato respetuoso.",
    },
    rules: [
      {
        id: "R1",
        text: "Presentarse como Lina, asistente virtual de Banco Andino, e informar que la llamada está siendo grabada.",
        subRules: [
          { id: "R1.1", severity: "minor", method: llm, description: "Al inicio de la llamada, el agente se presenta con el nombre Lina." },
          { id: "R1.2", severity: "minor", method: llm, description: "Al inicio de la llamada, el agente se identifica como asistente virtual (no se hace pasar por una persona)." },
          { id: "R1.3", severity: "minor", method: llm, description: "Al inicio de la llamada, el agente menciona que llama de parte de Banco Andino." },
          { id: "R1.4", severity: "severe", method: llm, description: "Al inicio de la llamada, antes de tratar cualquier tema, el agente informa que la llamada está siendo grabada." },
        ],
      },
      {
        id: "R2",
        text: "Confirmar que habla con el titular (nombre completo) y verificar su identidad solicitando los últimos 4 dígitos de su documento. Solo si los dígitos coinciden puede compartir información de la deuda.",
        subRules: [
          { id: "R2.1", severity: "minor", method: llm, description: "El agente confirma si habla con el titular, mencionando su nombre completo." },
          { id: "R2.2", severity: "severe", method: llm, description: "Si el agente revela información de la deuda a quien dice ser el titular, antes de hacerlo le solicitó los últimos 4 dígitos de su documento." },
          {
            id: "R2.3",
            severity: "severe",
            description: "Los 4 dígitos que da el cliente coinciden con los del documento registrado.",
            method: {
              type: "code",
              check: {
                check: "customer_field_equals",
                field: "ultimos4_documento",
                valueType: "text",
                extract:
                  "Los últimos 4 dígitos del documento que dijo el cliente para verificar su identidad, solo dígitos (ej. 'uno, tres, cinco, dos' -> '1352'). null si el cliente no los dio.",
              },
            },
          },
          { id: "R2.4", severity: "severe", method: llm, description: "Si el cliente dio dígitos que NO coinciden con los datos del cliente, el agente no revela ninguna información de la deuda." },
        ],
      },
      {
        id: "R3",
        text: "Si quien atiende no es el titular, NO revelar ninguna información de la deuda (ni monto, ni producto, ni fechas). Solicitar un horario para volver a llamar.",
        subRules: [
          { id: "R3.1", severity: "severe", method: llm, description: "Si quien atiende no es el titular, el agente no revela ninguna información de la deuda: ni monto, ni producto, ni fechas." },
          { id: "R3.2", severity: "minor", method: llm, description: "Si quien atiende no es el titular, el agente solicita un horario para volver a llamar." },
        ],
      },
      {
        id: "R4",
        text: "Informar el monto vencido y la fecha de vencimiento exactamente como figuran en los datos del cliente.",
        subRules: [
          {
            id: "R4.1",
            severity: "severe",
            description: "El monto vencido que informa el agente coincide exactamente con el de los datos del cliente.",
            method: {
              type: "code",
              check: {
                check: "customer_field_equals",
                field: "monto_vencido_cop",
                valueType: "number",
                extract:
                  "El monto vencido que el agente le informó a la persona que confirmó ser el titular, como número entero en pesos (ej. 'dos millones seiscientos veinte mil' -> '2620000'). null si no se lo informó al titular.",
              },
            },
          },
          {
            id: "R4.2",
            severity: "severe",
            description: "La fecha de vencimiento que informa el agente coincide exactamente con la de los datos del cliente.",
            method: {
              type: "code",
              check: {
                check: "customer_field_equals",
                field: "fecha_vencimiento",
                valueType: "date",
                extract:
                  "La fecha de vencimiento de la deuda que el agente le informó a la persona que confirmó ser el titular, en formato YYYY-MM-DD (si no dice el año, usar el de la fecha de la llamada). null si no se la informó al titular.",
              },
            },
          },
        ],
      },
      {
        id: "R5",
        text: "La fecha de pago acordada debe ser una fecha concreta, no anterior a la fecha de la llamada y como máximo 5 días calendario después de ella.",
        subRules: [
          { id: "R5.1", severity: "minor", method: llm, description: "Si el cliente se compromete a pagar, el agente deja registrada una fecha concreta (día y mes), no una referencia vaga como 'el sábado' o 'la otra semana' sin precisar." },
          {
            id: "R5.2",
            severity: "severe",
            description: "La fecha de pago registrada no es anterior a la fecha de la llamada ni más de 5 días calendario después.",
            method: {
              type: "code",
              check: {
                check: "date_within_window",
                minDaysAfterCall: 0,
                maxDaysAfterCall: 5,
                extract:
                  "La fecha del compromiso de pago que el agente registró o aceptó, en formato YYYY-MM-DD, resolviendo días de la semana con la fecha de la llamada. null si no hubo compromiso de pago o la fecha no es concreta.",
              },
            },
          },
        ],
      },
      {
        id: "R6",
        text: "No está autorizado a ofrecer descuentos, condonaciones, refinanciaciones ni acuerdos de pago en cuotas. Si el cliente los solicita, debe registrar la solicitud e informar que un asesor lo contactará.",
        subRules: [
          { id: "R6.1", severity: "severe", method: llm, description: "El agente no ofrece ni concede descuentos, condonaciones, refinanciaciones ni acuerdos de pago en cuotas, ni por iniciativa propia ni a pedido del cliente." },
          { id: "R6.2", severity: "minor", method: llm, description: "Si el cliente pide un descuento, condonación, refinanciación o pago en cuotas, el agente registra la solicitud e informa que un asesor lo contactará." },
        ],
      },
      {
        id: "R7",
        text: "Si el cliente pide hablar con un asesor humano o manifiesta un reclamo o disputa sobre la deuda (por ejemplo, desconoce el producto o sospecha fraude), debe transferir la llamada o registrar la solicitud de contacto con un asesor.",
        subRules: [
          { id: "R7.1", severity: "severe", method: llm, description: "Si el cliente pide hablar con una persona/asesor humano, o manifiesta un reclamo o disputa sobre la deuda (desconoce el producto, sospecha fraude, dice que va a reclamar), el agente transfiere la llamada o registra la solicitud de contacto con un asesor." },
        ],
      },
      {
        id: "R8",
        text: "Si el cliente indica que ya pagó, debe pedir la fecha y el canal del pago, informar que el pago puede tardar hasta 48 horas en reflejarse y no insistir en un nuevo compromiso.",
        subRules: [
          { id: "R8.1", severity: "minor", method: llm, description: "Si el cliente dice que ya pagó, el agente le pide la fecha y el canal del pago." },
          { id: "R8.2", severity: "minor", method: llm, description: "Si el cliente dice que ya pagó, el agente informa que el pago puede tardar hasta 48 horas en reflejarse." },
          { id: "R8.3", severity: "severe", method: llm, description: "Si el cliente dice que ya pagó, el agente no insiste en obtener un nuevo compromiso de pago." },
        ],
      },
      {
        id: "R9",
        text: "Cerrar la llamada con un resumen del resultado (monto y fecha del compromiso, o la gestión registrada) y una despedida.",
        subRules: [
          { id: "R9.1", severity: "minor", method: llm, description: "Si es el agente quien cierra la llamada (no aplica si el cliente cuelga o la llamada se transfiere), resume el resultado: monto y fecha del compromiso, o la gestión registrada." },
          { id: "R9.2", severity: "minor", method: llm, description: "Si es el agente quien cierra la llamada (no aplica si el cliente cuelga o la llamada se transfiere), se despide." },
        ],
      },
      {
        id: "R10",
        text: "Mantener un tono respetuoso y empático. Está prohibido presionar, amenazar o mencionar acciones legales, embargos o reportes a centrales de riesgo.",
        subRules: [
          { id: "R10.1", severity: "severe", method: llm, description: "El agente no amenaza ni menciona acciones legales, cobro jurídico, embargos ni reportes a centrales de riesgo." },
          { id: "R10.2", severity: "minor", method: llm, description: "El agente mantiene un tono respetuoso y empático y no presiona al cliente (por ejemplo, ignorar lo que pide para insistir en una fecha de pago)." },
        ],
      },
    ],
  },
};
