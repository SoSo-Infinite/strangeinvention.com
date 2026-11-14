import nodemailer from "nodemailer";
import type { SendMail } from "./orders";

function smtpEnv(env: NodeJS.ProcessEnv) {
  const host = env.SMTP_HOST?.trim();
  const portRaw = env.SMTP_PORT?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !portRaw || !user || !pass) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { host, port, user, pass };
}

/** Sends one plain-text note. Missing mail settings skip quietly. */
export function createSmtpSender(env: NodeJS.ProcessEnv = process.env): SendMail {
  return async (mail) => {
    const smtp = smtpEnv(env);
    if (!smtp) return "skipped";
    try {
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transport.sendMail({
        from: smtp.user,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
      return "sent";
    } catch (err) {
      console.error("order mail failed", err instanceof Error ? err.message : "unknown");
      return "failed";
    }
  };
}
