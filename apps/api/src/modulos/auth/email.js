import nodemailer from "nodemailer";
import { env } from "../../env.js";

/**
 * Monta o email de recuperação de senha — função pura, sem I/O, pra dar pra
 * testar o conteúdo sem precisar de um servidor SMTP de verdade.
 */
export function montarEmailRecuperacao({ para, token, minutosDeValidade }) {
  return {
    from: env.SMTP.remetente,
    to: para,
    subject: "Código para redefinir sua senha — Arkos",
    text:
      `Use o código abaixo na tela de login para redefinir sua senha.\n\n` +
      `${token}\n\n` +
      `Vale por ${minutosDeValidade} minutos e só pode ser usado uma vez. ` +
      `Se você não pediu essa redefinição, ignore este email.`,
    html:
      `<p>Use o código abaixo na tela de login para redefinir sua senha.</p>` +
      `<p style="font-size:20px;font-weight:700;letter-spacing:1px">${token}</p>` +
      `<p>Vale por ${minutosDeValidade} minutos e só pode ser usado uma vez. ` +
      `Se você não pediu essa redefinição, ignore este email.</p>`,
  };
}

let transportador = null;

/** Um só transporter reaproveitado entre chamadas — reconectar a cada email seria desperdício. */
function transporte() {
  if (!transportador) {
    transportador = nodemailer.createTransport({
      host: env.SMTP.host,
      port: env.SMTP.port,
      secure: env.SMTP.port === 465,
      auth: env.SMTP.usuario ? { user: env.SMTP.usuario, pass: env.SMTP.senha } : undefined,
    });
  }
  return transportador;
}

/**
 * Envia o email de recuperação. Sem `SMTP_HOST` configurado, não tenta enviar
 * — quem chamou decide o que fazer (hoje: logar e, em desenvolvimento, devolver
 * o código na resposta). Nunca derruba o fluxo de recuperação de senha: um
 * provedor de email fora do ar não pode impedir o resto do sistema.
 */
export async function enviarEmailRecuperacao({ para, token, minutosDeValidade }, { logger } = {}) {
  if (!env.SMTP.host) {
    return { enviado: false, motivo: "SMTP_HOST não configurado" };
  }

  try {
    await transporte().sendMail(montarEmailRecuperacao({ para, token, minutosDeValidade }));
    return { enviado: true };
  } catch (erro) {
    logger?.warn({ erro: erro.message, para }, "falha ao enviar email de recuperação de senha");
    return { enviado: false, motivo: erro.message };
  }
}
