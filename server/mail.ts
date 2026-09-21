import nodemailer, { type Transporter } from "nodemailer";

// SMTP settings come from .env only. Gmail: SMTP_USER is the Gmail address and SMTP_PASS an app password
// (Google account → security → 2-step verification → app passwords). Other providers set SMTP_HOST/PORT.
export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  defaultTo: string;
};
export function mailConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MailConfig | null {
  const user = env.SMTP_USER?.trim(),
    pass = env.SMTP_PASS?.trim();
  if (!user && !pass) return null;
  if (!user || !pass)
    throw new Error("이메일 발송에는 SMTP_USER와 SMTP_PASS가 모두 필요합니다.");
  const host = env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT?.trim() || 465);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error("SMTP_PORT 값을 확인해 주세요.");
  const from = env.MAIL_FROM?.trim() || `Oh My Stock <${user}>`;
  const defaultTo = env.MAIL_TO?.trim() || user;
  return { host, port, secure: port === 465, user, pass, from, defaultTo };
}

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type MailSender = { send(message: MailMessage): Promise<void> };

export class Mailer implements MailSender {
  private transporter: Transporter;
  constructor(readonly config: MailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
    });
  }
  async send(message: MailMessage) {
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
