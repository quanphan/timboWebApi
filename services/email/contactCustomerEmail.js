const GOLD = '#c6a35a';
const INK = '#111111';
const IVORY = '#f4efe4';
const MUTED = '#b8b0a4';
const PANEL = '#1a1a1a';
const LINE = '#2a2a2a';

const COPY = {
    en: {
        lang: 'en',
        brand: 'PHANQUAN GUITARS',
        kicker: 'CONTACT CONFIRMATION',
        subject: 'Thank You for Contacting PhanQuan Guitars',
        title: 'Thank you for reaching out',
        intro: [
            'Thank you for reaching out to PhanQuan Guitars.',
            'We have successfully received your message.',
            'Our team will review your inquiry and get back to you as soon as possible.',
        ],
        details: 'Your message',
        name: 'Name',
        email: 'Email',
        phone: 'Phone',
        message: 'Message',
        notProvided: 'Not provided',
        footer: 'PhanQuan Guitars · Handmade in Vietnam',
    },
    vi: {
        lang: 'vi',
        brand: 'PHANQUAN GUITARS',
        kicker: 'XÁC NHẬN LIÊN HỆ',
        subject: 'Cảm ơn bạn đã liên hệ PhanQuan Guitars',
        title: 'Cảm ơn bạn đã liên hệ',
        intro: [
            'Cảm ơn bạn đã liên hệ PhanQuan Guitars.',
            'Chúng tôi đã nhận được tin nhắn của bạn.',
            'Đội ngũ sẽ xem xét yêu cầu và phản hồi sớm nhất có thể.',
        ],
        details: 'Nội dung bạn đã gửi',
        name: 'Họ tên',
        email: 'Email',
        phone: 'Điện thoại',
        message: 'Tin nhắn',
        notProvided: 'Không cung cấp',
        footer: 'PhanQuan Guitars · Thủ công tại Việt Nam',
    },
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function oneLine(value) {
    return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function displayValue(value, emptyLabel) {
    const text = oneLine(value);
    return text || emptyLabel;
}

function contactLanguage(record) {
    return record?.language === 'vi' ? 'vi' : 'en';
}

function nlHtml(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function sectionHeadingHtml(title) {
    return `<tr><td style="padding:28px 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD};border-top:1px solid ${LINE};">${escapeHtml(title)}</td></tr>`;
}

function rowHtml(label, value, multiline) {
    const rendered = multiline ? nlHtml(value) : escapeHtml(value);
    return `<tr><td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="38%" valign="top" style="padding:0 16px 0 0;font-size:12px;color:${MUTED};">${escapeHtml(label)}</td>
          <td valign="top" style="font-size:14px;line-height:1.5;color:${IVORY};">${rendered}</td>
        </tr>
      </table>
    </td></tr>`;
}

function customerDetails(record, copy) {
    return [
        { label: copy.name, value: displayValue(record?.name, copy.notProvided) },
        { label: copy.email, value: displayValue(record?.email, copy.notProvided) },
        { label: copy.phone, value: displayValue(record?.phone, copy.notProvided) },
        { label: copy.message, value: displayValue(record?.message, copy.notProvided), multiline: true },
    ];
}

function buildHtml(copy, details) {
    const introHtml = copy.intro.map((line) => (
        `<tr><td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${IVORY};">${escapeHtml(line)}</td></tr>`
    )).join('');
    return `<!DOCTYPE html>
<html lang="${copy.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${PANEL};">
          <tr>
            <td style="padding:28px 28px 18px 28px;border-bottom:3px solid ${GOLD};">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;color:${GOLD};">${escapeHtml(copy.brand)}</div>
              <div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;color:${MUTED};">${escapeHtml(copy.kicker)}</div>
              <h1 style="margin:14px 0 0 0;font-family:Georgia,Times,serif;font-size:26px;line-height:1.25;font-weight:normal;color:${IVORY};">${escapeHtml(copy.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${introHtml}
                ${sectionHeadingHtml(copy.details)}
                ${details.map((row) => rowHtml(row.label, row.value, Boolean(row.multiline))).join('')}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;color:${MUTED};">${escapeHtml(copy.footer)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(copy, details) {
    const lines = [
        copy.brand,
        copy.kicker,
        copy.title,
        '',
        ...copy.intro,
        '',
        copy.details.toUpperCase(),
        ...details.map((row) => `${row.label}: ${row.value}`),
        '',
        copy.footer,
    ];
    return lines.join('\n');
}

function contactCustomerEmail(record) {
    const copy = COPY[contactLanguage(record)];
    const details = customerDetails(record, copy);
    return {
        subject: copy.subject,
        text: buildText(copy, details),
        html: buildHtml(copy, details),
    };
}

module.exports = {
    COPY,
    contactLanguage,
    contactCustomerEmail,
};
