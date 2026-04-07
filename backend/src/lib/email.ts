import nodemailer from 'nodemailer'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
  })
}

function resolveVerificationFromAddress(): string {
  const rawFrom = (process.env.SMTP_FROM ?? '').trim()
  const match = rawFrom.match(/<([^>]+)>/)
  const fromEmail = match?.[1] ?? (rawFrom.includes('@') ? rawFrom : undefined) ?? process.env.SMTP_USER ?? 'noreply@doc-compare.local'
  return `Hugo Gu <${fromEmail}>`
}

export async function sendExpiryWarningEmail(
  to: string,
  daysLeft: number,
  expiresAt: Date
): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173'
  const subscriptionUrl = `${baseUrl}/subscription`
  const from = process.env.SMTP_FROM ?? 'noreply@doc-compare.local'
  const expiryStr = expiresAt.toLocaleDateString('zh-CN')

  if (!process.env.SMTP_HOST) {
    console.log(`[email] SMTP not configured — skipping expiry warning to ${to} (daysLeft=${daysLeft})`)
    return
  }

  const transport = createTransport()
  await transport.sendMail({
    from,
    to,
    subject: `您的咖啡快凉了，还剩 ${daysLeft} 天 ☕`,
    text: `您好！\n\n您的订阅将于 ${expiryStr} 到期，还剩 ${daysLeft} 天。\n\n续杯链接：${subscriptionUrl}\n\n续杯后，您的电量和词条解锁记录将全部保留，继续您的词典研究之旅 ☕`,
    html: `<p>您好！</p><p>您的订阅将于 <strong>${expiryStr}</strong> 到期，还剩 <strong>${daysLeft} 天</strong>。</p><p><a href="${subscriptionUrl}">再续一杯？点此前往</a></p><p>续杯后，您的电量和词条解锁记录将全部保留，继续您的词典研究之旅 ☕</p>`,
  })
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173'
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`
  const from = resolveVerificationFromAddress()
  const ttl = process.env.VERIFICATION_TOKEN_TTL_HOURS ?? '24'

  if (!process.env.SMTP_HOST) {
    console.log(`[email] SMTP not configured — skipping send. Verification URL for ${to}:`)
    console.log(`[email] ${verificationUrl}`)
    return
  }

  const transport = createTransport()
  await transport.sendMail({
    from,
    to,
    subject: '来自辞书研习平台的验证邮件',
    text: `您好！\n\n欢迎使用辞书研习平台。请点击以下链接完成邮箱验证：\n\n${verificationUrl}\n\n该链接将在 ${ttl} 小时后失效。\n\n如果这不是您的操作，请忽略本邮件。`,
    html: `<div style="margin:0;padding:24px;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:28px 28px 10px 28px;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);color:#ffffff;">
        <div style="font-size:18px;font-weight:700;letter-spacing:.2px;">辞书研习平台</div>
        <div style="margin-top:8px;font-size:14px;opacity:.9;">邮箱验证</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 8px 28px;">
        <p style="margin:0 0 12px 0;font-size:16px;line-height:1.7;">您好，</p>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.8;color:#374151;">欢迎使用辞书研习平台。请点击下方按钮完成邮箱验证，验证链接将在 <strong>${ttl} 小时</strong>后失效。</p>
        <p style="margin:22px 0 22px 0;">
          <a href="${verificationUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">立即验证邮箱</a>
        </p>
        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#6b7280;">若按钮无法点击，请复制以下链接到浏览器打开：</p>
        <p style="margin:0 0 18px 0;font-size:13px;line-height:1.8;word-break:break-all;"><a href="${verificationUrl}" style="color:#1d4ed8;text-decoration:underline;">${verificationUrl}</a></p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 22px 28px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;line-height:1.8;color:#6b7280;">如果您没有发起本次注册或验证请求，请忽略此邮件。</p>
      </td>
    </tr>
  </table>
</div>`,
  })
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173'
  const resetUrl = `${baseUrl}/reset-password?token=${token}`
  const from = resolveVerificationFromAddress()
  const ttl = process.env.RESET_PASSWORD_TOKEN_TTL_HOURS ?? '2'

  if (!process.env.SMTP_HOST) {
    console.log(`[email] SMTP not configured — skipping send. Password reset URL for ${to}:`)
    console.log(`[email] ${resetUrl}`)
    return
  }

  const transport = createTransport()
  await transport.sendMail({
    from,
    to,
    subject: '辞书研习平台密码重置',
    text: `您好！\n\n我们收到了您的密码重置请求。请点击以下链接设置新密码：\n\n${resetUrl}\n\n该链接将在 ${ttl} 小时后失效。如果这不是您的操作，请忽略本邮件，您的密码不会被修改。`,
    html: `<div style="margin:0;padding:24px;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:28px 28px 10px 28px;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);color:#ffffff;">
        <div style="font-size:18px;font-weight:700;letter-spacing:.2px;">辞书研习平台</div>
        <div style="margin-top:8px;font-size:14px;opacity:.9;">密码重置</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 8px 28px;">
        <p style="margin:0 0 12px 0;font-size:16px;line-height:1.7;">您好，</p>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.8;color:#374151;">我们收到了您的密码重置请求。请点击下方按钮设置新密码，重置链接将在 <strong>${ttl} 小时</strong>后失效。</p>
        <p style="margin:22px 0 22px 0;">
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">设置新密码</a>
        </p>
        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#6b7280;">若按钮无法点击，请复制以下链接到浏览器打开：</p>
        <p style="margin:0 0 18px 0;font-size:13px;line-height:1.8;word-break:break-all;"><a href="${resetUrl}" style="color:#1d4ed8;text-decoration:underline;">${resetUrl}</a></p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 22px 28px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;line-height:1.8;color:#6b7280;">如果您没有发起本次请求，请忽略此邮件，您的密码不会发生变化。</p>
      </td>
    </tr>
  </table>
</div>`,
  })
}
