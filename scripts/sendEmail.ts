// @ts-nocheck
/* eslint-disable @typescript-eslint/no-var-requires */
const sgMail = require("@sendgrid/mail");

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  throw new Error("Missing SENDGRID_API_KEY");
}

sgMail.setApiKey(apiKey);

async function sendCantamiEmail({ toEmail, toName = "David" }) {
  const msg = {
    to: {
      email: toEmail,
      name: toName,
    },
    from: {
      email: "info@cantami.net",
      name: "Cantami",
    },
    replyTo: {
      email: "info@cantami.net",
      name: "Cantami Support",
    },
    subject: "Your message from Cantami",
    text: `Hi ${toName},

This is a confirmation message sent from Cantami.

You can reply directly to this email if you need assistance.

Best regards,
Cantami Team
https://cantami.net`,
    html: `<p>Hi ${toName},</p>
<p>This is a confirmation message sent from <strong>Cantami</strong>.</p>
<p>You can reply directly to this email if you need assistance.</p>
<p>Best regards,<br/>
Cantami Team<br/>
<a href="https://cantami.net">https://cantami.net</a></p>`,
  };

  await sgMail.send(msg);
}

if (require.main === module) {
  sendCantamiEmail({
    toEmail: "fortini.david@gmail.com",
    toName: "David",
  })
    .then(() => {
      console.log("Email sent.");
    })
    .catch((error) => {
      console.error("Failed to send email:", error);
      process.exitCode = 1;
    });
}

module.exports = { sendCantamiEmail };
